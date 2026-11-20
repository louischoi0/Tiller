//! SSH connections: interactive shell sessions and local port forwards.

use crate::store::{self, Host, Store};
use base64::Engine;
use russh::client::{self, Handle};
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{ChannelMsg, Disconnect};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot};

pub struct Client {
    expected: Option<String>,
    seen: Arc<Mutex<Option<String>>>,
}

impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        let fp = key.public_key().fingerprint(HashAlg::Sha256).to_string();
        *self.seen.lock().unwrap() = Some(fp.clone());
        Ok(self.expected.as_ref().is_none_or(|e| *e == fp))
    }
}

pub enum Cmd {
    Data(Vec<u8>),
    Resize(u32, u32),
    Close,
}

#[derive(Default)]
pub struct Sessions {
    shells: Mutex<HashMap<String, mpsc::UnboundedSender<Cmd>>>,
    forwards: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

#[derive(Serialize, Clone)]
struct DataEvent<'a> {
    id: &'a str,
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitEvent<'a> {
    id: &'a str,
    message: String,
}

/// Connects and authenticates. Returns the handle and, on first contact, the
/// fingerprint that was just trusted.
async fn open(store: &Store, host: &Host, password: Option<String>) -> Result<(Handle<Client>, Option<String>), String> {
    let expected = store.known_fingerprint(&host.id);
    let seen = Arc::new(Mutex::new(None));
    let handler = Client { expected: expected.clone(), seen: seen.clone() };
    let config = Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        nodelay: true,
        ..Default::default()
    });

    let addr = (host.address.as_str(), host.port);
    let connected = tokio::time::timeout(Duration::from_secs(15), client::connect(config, addr, handler)).await;
    let mut handle = match connected {
        Err(_) => return Err(format!("Connection to {}:{} timed out.", host.address, host.port)),
        Ok(Err(e)) => {
            let seen = seen.lock().unwrap().clone();
            if let (Some(exp), Some(got)) = (&expected, &seen) {
                if exp != got {
                    return Err(format!(
                        "WARNING: the server fingerprint does not match the saved one. This could be a man-in-the-middle attack, so the connection was aborted.\r\n\
                         Saved:    {exp}\r\nReceived: {got}\r\n\
                         If you know the server was reinstalled, use 'Reset server fingerprint' in the host editor."
                    ));
                }
            }
            return Err(format!("Connection failed: {e}"));
        }
        Ok(Ok(h)) => h,
    };

    let new_fp = if expected.is_none() { seen.lock().unwrap().clone() } else { None };

    let auth = if host.auth == "key" {
        let key_id = host.key_id.as_deref().ok_or("No key is set for this host.")?;
        let pem = std::fs::read_to_string(store.key_path(key_id)).map_err(|_| "Key file not found. Check Settings > SSH keys.")?;
        let passphrase = store::secret_get(&store::key_account(key_id))?;
        let key = russh::keys::decode_secret_key(&pem, passphrase.as_deref()).map_err(|e| format!("Can't read the key: {e}"))?;
        let hash = handle.best_supported_rsa_hash().await.ok().flatten().flatten();
        handle
            .authenticate_publickey(&host.username, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
            .await
            .map_err(|e| format!("Authentication error: {e}"))?
    } else {
        let pw = match password {
            Some(p) => p,
            None => store::secret_get(&store::host_account(&host.id))?.ok_or("PASSWORD_REQUIRED")?,
        };
        let r = handle.authenticate_password(&host.username, pw).await.map_err(|e| format!("Authentication error: {e}"))?;
        if !r.success() {
            return Err("AUTH_FAILED_PASSWORD".into());
        }
        r
    };
    if !auth.success() {
        return Err("Key authentication failed. Check that the public key is in the server's ~/.ssh/authorized_keys.".into());
    }

    if let Some(fp) = &new_fp {
        store.set_known_fingerprint(&host.id, Some(fp.clone()))?;
    }
    Ok((handle, new_fp))
}

impl Sessions {
    pub async fn connect<R: Runtime>(
        &self,
        app: AppHandle<R>,
        store: &Store,
        session_id: String,
        host_id: String,
        cols: u32,
        rows: u32,
        password: Option<String>,
    ) -> Result<Option<String>, String> {
        let host = store.host(&host_id)?;
        let (handle, new_fp) = open(store, &host, password).await?;

        let mut channel = handle.channel_open_session().await.map_err(|e| format!("Failed to open session: {e}"))?;
        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| format!("PTY request failed: {e}"))?;
        channel.request_shell(false).await.map_err(|e| format!("Shell request failed: {e}"))?;

        let (tx, mut rx) = mpsc::unbounded_channel::<Cmd>();
        self.shells.lock().unwrap().insert(session_id.clone(), tx);

        let b64 = base64::engine::general_purpose::STANDARD;
        tauri::async_runtime::spawn(async move {
            let mut exit_code: Option<u32> = None;
            let reason = loop {
                tokio::select! {
                    msg = channel.wait() => match msg {
                        Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                            let _ = app.emit("ssh-data", DataEvent { id: &session_id, data: b64.encode(&data) });
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => exit_code = Some(exit_status),
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            break match exit_code {
                                Some(c) => format!("exit code {c}"),
                                None if handle.is_closed() => "connection lost".to_string(),
                                None => "session ended".to_string(),
                            };
                        }
                        _ => {}
                    },
                    cmd = rx.recv() => match cmd {
                        Some(Cmd::Data(bytes)) => {
                            if channel.data(&bytes[..]).await.is_err() {
                                break "send failed".to_string();
                            }
                        }
                        Some(Cmd::Resize(c, r)) => { let _ = channel.window_change(c, r, 0, 0).await; }
                        Some(Cmd::Close) | None => {
                            let _ = channel.close().await;
                            break "closed".to_string();
                        }
                    },
                }
            };
            let _ = handle.disconnect(Disconnect::ByApplication, "", "en").await;
            let _ = app.emit("ssh-exit", ExitEvent { id: &session_id, message: reason });
        });

        Ok(new_fp)
    }

    fn send(&self, id: &str, cmd: Cmd) -> Result<(), String> {
        let shells = self.shells.lock().unwrap();
        let tx = shells.get(id).ok_or("No such session.")?;
        tx.send(cmd).map_err(|_| "Session has ended.".to_string())
    }

    pub fn write(&self, id: &str, data: String) -> Result<(), String> {
        self.send(id, Cmd::Data(data.into_bytes()))
    }

    pub fn resize(&self, id: &str, cols: u32, rows: u32) -> Result<(), String> {
        self.send(id, Cmd::Resize(cols, rows))
    }

    pub fn close(&self, id: &str) {
        if let Some(tx) = self.shells.lock().unwrap().remove(id) {
            let _ = tx.send(Cmd::Close);
        }
    }

    // ---- local port forwarding -------------------------------------------

    pub async fn forward_start<R: Runtime>(self: Arc<Self>, app: AppHandle<R>, store: &Store, forward_id: String) -> Result<(), String> {
        if self.forwards.lock().unwrap().contains_key(&forward_id) {
            return Ok(());
        }
        let fwd = store.forward(&forward_id)?;
        let host = store.host(&fwd.host_id)?;
        let listener = TcpListener::bind(("127.0.0.1", fwd.local_port))
            .await
            .map_err(|e| format!("Can't listen on 127.0.0.1:{} (it may be in use): {e}", fwd.local_port))?;
        let (handle, _) = open(store, &host, None).await.map_err(|e| match e.as_str() {
            "PASSWORD_REQUIRED" | "AUTH_FAILED_PASSWORD" => {
                "Forwarding needs a correct saved password for this host.".to_string()
            }
            _ => e,
        })?;
        let handle = Arc::new(handle);

        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
        self.forwards.lock().unwrap().insert(forward_id.clone(), stop_tx);

        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(5));
            let reason = loop {
                tokio::select! {
                    _ = &mut stop_rx => break None,
                    _ = tick.tick() => {
                        if handle.is_closed() {
                            break Some("connection lost".to_string());
                        }
                    }
                    accepted = listener.accept() => {
                        let (mut sock, peer) = match accepted {
                            Ok(x) => x,
                            Err(e) => break Some(format!("Local port error: {e}")),
                        };
                        let handle = handle.clone();
                        let (rhost, rport) = (fwd.remote_host.clone(), fwd.remote_port as u32);
                        tokio::spawn(async move {
                            match handle.channel_open_direct_tcpip(rhost, rport, peer.ip().to_string(), peer.port() as u32).await {
                                Ok(ch) => {
                                    let mut stream = ch.into_stream();
                                    let _ = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
                                }
                                Err(_) => drop(sock),
                            }
                        });
                    }
                }
            };
            me.forwards.lock().unwrap().remove(&forward_id);
            let _ = handle.disconnect(Disconnect::ByApplication, "", "en").await;
            if let Some(message) = reason {
                let _ = app.emit("forward-exit", ExitEvent { id: &forward_id, message });
            }
        });
        Ok(())
    }

    pub fn forward_stop(&self, forward_id: &str) {
        if let Some(tx) = self.forwards.lock().unwrap().remove(forward_id) {
            let _ = tx.send(());
        }
    }

    pub fn forward_active(&self) -> Vec<String> {
        self.forwards.lock().unwrap().keys().cloned().collect()
    }
}
