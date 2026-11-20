//! Minimal SSH server for trying Tiller without a real server.
//!
//!   cargo run --example test_server [port]     (listens on 127.0.0.1:2223 by default)
//!
//! Any username works; the password is `test`, and any public key is accepted.
//! The "shell" echoes what you type and answers a few commands (help, size, whoami, exit).
//! Port forwarding (direct-tcpip) really connects to the requested target.

use russh::keys::{Algorithm, PrivateKey};
use russh::server::{self, Auth, ChannelOpenHandle, Msg, Server as _, Session, VerifiedPublicKey};
use russh::{Channel, ChannelId, Pty};
use std::collections::HashMap;
use std::sync::Arc;

#[allow(dead_code)]
#[tokio::main]
async fn main() {
    let port = std::env::args().nth(1).and_then(|p| p.parse().ok()).unwrap_or(2223);
    println!("test SSH server on 127.0.0.1:{port} (password: test)");
    serve(port, PrivateKey::random(&mut russh::keys::key::safe_rng(), Algorithm::Ed25519).unwrap())
        .await;
}

pub async fn serve(port: u16, host_key: PrivateKey) {
    let config = Arc::new(server::Config {
        keys: vec![host_key],
        auth_rejection_time: std::time::Duration::from_millis(100),
        auth_rejection_time_initial: Some(std::time::Duration::from_millis(0)),
        ..Default::default()
    });
    let socket = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap();
    TestServer::default().run_on_socket(config, &socket).await.unwrap();
}

#[derive(Default, Clone)]
struct TestServer {
    user: String,
    line: HashMap<ChannelId, String>,
    size: (u32, u32),
}

impl server::Server for TestServer {
    type Handler = Self;
    fn new_client(&mut self, _: Option<std::net::SocketAddr>) -> Self {
        Self::default()
    }
}

fn send(session: &mut Session, ch: ChannelId, s: &str) {
    let _ = session.data(ch, s.as_bytes().to_vec());
}

impl server::Handler for TestServer {
    type Error = russh::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        self.user = user.to_string();
        Ok(if password == "test" { Auth::Accept } else { Auth::reject() })
    }

    async fn auth_publickey(&mut self, user: &str, _: VerifiedPublicKey<'_>) -> Result<Auth, Self::Error> {
        self.user = user.to_string();
        Ok(Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        _channel: Channel<Msg>,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        reply.accept().await;
        Ok(())
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _term: &str,
        cols: u32,
        rows: u32,
        _: u32,
        _: u32,
        _: &[(Pty, u32)],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.size = (cols, rows);
        let _ = session.channel_success(channel);
        Ok(())
    }

    async fn shell_request(&mut self, channel: ChannelId, session: &mut Session) -> Result<(), Self::Error> {
        let _ = session.channel_success(channel);
        self.line.insert(channel, String::new());
        send(session, channel, &format!("Tiller test server. Hello, {}! Type 'help'.\r\n$ ", self.user));
        Ok(())
    }

    async fn window_change_request(
        &mut self,
        _channel: ChannelId,
        cols: u32,
        rows: u32,
        _: u32,
        _: u32,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.size = (cols, rows);
        Ok(())
    }

    async fn data(&mut self, channel: ChannelId, data: &[u8], session: &mut Session) -> Result<(), Self::Error> {
        let text = String::from_utf8_lossy(data).to_string();
        for ch in text.chars() {
            let line = self.line.entry(channel).or_default();
            match ch {
                '\r' | '\n' => {
                    let cmd = std::mem::take(line);
                    let out = match cmd.trim() {
                        "" => String::new(),
                        "help" => "commands: help, size, whoami, exit\r\n".into(),
                        "size" => format!("{}x{}\r\n", self.size.0, self.size.1),
                        "whoami" => format!("{}\r\n", self.user),
                        "exit" => {
                            send(session, channel, "\r\nbye\r\n");
                            let _ = session.exit_status_request(channel, 0);
                            let _ = session.eof(channel);
                            let _ = session.close(channel);
                            return Ok(());
                        }
                        other => format!("echo: {other}\r\n"),
                    };
                    send(session, channel, &format!("\r\n{out}$ "));
                }
                '\x7f' | '\x08' => {
                    if line.pop().is_some() {
                        send(session, channel, "\x08 \x08");
                    }
                }
                c if c >= ' ' => {
                    line.push(c);
                    send(session, channel, &c.to_string());
                }
                _ => {}
            }
        }
        Ok(())
    }

    async fn channel_open_direct_tcpip(
        &mut self,
        channel: Channel<Msg>,
        host: &str,
        port: u32,
        _: &str,
        _: u32,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let target = format!("{host}:{port}");
        match tokio::net::TcpStream::connect(&target).await {
            Ok(mut sock) => {
                reply.accept().await;
                tokio::spawn(async move {
                    let mut stream = channel.into_stream();
                    let _ = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
                });
            }
            Err(_) => drop(reply),
        }
        Ok(())
    }
}
