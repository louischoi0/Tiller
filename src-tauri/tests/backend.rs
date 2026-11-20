//! End-to-end backend tests against the bundled test SSH server.
#[allow(dead_code)]
#[path = "../examples/test_server.rs"]
mod test_server;

use base64::Engine;
use sshdeck_lib::ssh::Sessions;
use sshdeck_lib::store::Store;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Runtime};
use tokio::net::TcpListener;
use sshdeck_lib::store::{Forward, Host};
use russh::keys::ssh_key::LineEnding;
use russh::keys::{Algorithm, PrivateKey};
use tauri::Listener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn rng_key() -> PrivateKey {
    PrivateKey::random(&mut russh::keys::key::safe_rng(), Algorithm::Ed25519).unwrap()
}

async fn start_server() -> u16 {
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    tokio::spawn(test_server::serve(port, rng_key()));
    tokio::time::sleep(Duration::from_millis(200)).await;
    port
}

fn temp_store() -> Store {
    Store::open(std::env::temp_dir().join(format!("sshdeck-test-{}", uuid::Uuid::new_v4()))).unwrap()
}

fn host(port: u16, auth: &str, key_id: Option<String>) -> Host {
    Host {
        id: uuid::Uuid::new_v4().to_string(),
        name: "t".into(),
        address: "127.0.0.1".into(),
        port,
        username: "tester".into(),
        auth: auth.into(),
        key_id,
        collection_id: None,
    }
}

/// Collects ssh-data / ssh-exit events of one session as text.
fn capture<R: Runtime>(app: &AppHandle<R>, id: &str) -> (Arc<Mutex<String>>, Arc<Mutex<Option<String>>>) {
    let out = Arc::new(Mutex::new(String::new()));
    let exit = Arc::new(Mutex::new(None));
    let (o, sid) = (out.clone(), id.to_string());
    app.listen("ssh-data", move |e| {
        let v: serde_json::Value = serde_json::from_str(e.payload()).unwrap();
        if v["id"] == sid.as_str() {
            let bytes = base64::engine::general_purpose::STANDARD.decode(v["data"].as_str().unwrap()).unwrap();
            o.lock().unwrap().push_str(&String::from_utf8_lossy(&bytes));
        }
    });
    let (x, sid) = (exit.clone(), id.to_string());
    app.listen("ssh-exit", move |e| {
        let v: serde_json::Value = serde_json::from_str(e.payload()).unwrap();
        if v["id"] == sid.as_str() {
            *x.lock().unwrap() = Some(v["message"].as_str().unwrap().to_string());
        }
    });
    (out, exit)
}

async fn wait_for(what: &str, f: impl Fn() -> bool) {
    for _ in 0..50 {
        if f() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("timed out waiting for {what}");
}

#[tokio::test]
async fn password_shell_session() {
    let port = start_server().await;
    let store = temp_store();
    let h = host(port, "password", None);
    store.update(|d| d.hosts.push(h.clone())).unwrap();
    let app = tauri::test::mock_app();
    let sessions = Sessions::default();
    let (out, exit) = capture(app.handle(), "s1");

    // Wrong password is reported distinctly so the UI can re-prompt.
    let err = sessions
        .connect(app.handle().clone(), &store, "s0".into(), h.id.clone(), 80, 24, Some("nope".into()))
        .await
        .unwrap_err();
    assert_eq!(err, "AUTH_FAILED_PASSWORD");

    // First successful contact trusts and stores the fingerprint.
    let fp = sessions
        .connect(app.handle().clone(), &store, "s1".into(), h.id.clone(), 80, 24, Some("test".into()))
        .await
        .unwrap()
        .expect("first contact returns fingerprint");
    assert!(fp.starts_with("SHA256:"));
    assert_eq!(store.known_fingerprint(&h.id), Some(fp));

    wait_for("banner", || out.lock().unwrap().contains("Hello, tester")).await;
    sessions.write("s1", "whoami\r".into()).unwrap();
    wait_for("whoami", || out.lock().unwrap().contains("\r\ntester\r\n")).await;
    sessions.resize("s1", 100, 30).unwrap();
    sessions.write("s1", "size\r".into()).unwrap();
    wait_for("resize", || out.lock().unwrap().contains("100x30")).await;
    sessions.write("s1", "exit\r".into()).unwrap();
    wait_for("exit event", || exit.lock().unwrap().is_some()).await;
    assert_eq!(exit.lock().unwrap().as_deref(), Some("exit code 0"));
}

#[tokio::test]
async fn changed_server_key_is_rejected() {
    let port = start_server().await;
    let store = temp_store();
    let h = host(port, "password", None);
    store.update(|d| d.hosts.push(h.clone())).unwrap();
    store.set_known_fingerprint(&h.id, Some("SHA256:somethingelse".into())).unwrap();
    let app = tauri::test::mock_app();
    let err = Sessions::default()
        .connect(app.handle().clone(), &store, "s".into(), h.id.clone(), 80, 24, Some("test".into()))
        .await
        .unwrap_err();
    assert!(err.contains("does not match the saved one"), "{err}");
}

#[tokio::test]
async fn key_auth_and_local_forward() {
    let port = start_server().await;
    let store = temp_store();

    // Key auth with a generated key.
    let key_id = uuid::Uuid::new_v4().to_string();
    std::fs::write(store.key_path(&key_id), rng_key().to_openssh(LineEnding::LF).unwrap().as_bytes()).unwrap();
    let h = host(port, "key", Some(key_id));

    // An echo service the forward will reach "through" the SSH server.
    let echo = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let echo_port = echo.local_addr().unwrap().port();
    tokio::spawn(async move {
        while let Ok((mut s, _)) = echo.accept().await {
            tokio::spawn(async move {
                let (mut r, mut w) = s.split();
                let _ = tokio::io::copy(&mut r, &mut w).await;
            });
        }
    });

    let local_port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let f = Forward {
        id: "f1".into(),
        name: "t".into(),
        host_id: h.id.clone(),
        local_port,
        remote_host: "127.0.0.1".into(),
        remote_port: echo_port,
    };
    store.update(|d| { d.hosts.push(h.clone()); d.forwards.push(f.clone()); }).unwrap();

    let app = tauri::test::mock_app();
    let sessions = Arc::new(Sessions::default());
    sessions.clone().forward_start(app.handle().clone(), &store, "f1".into()).await.unwrap();
    assert_eq!(sessions.forward_active(), vec!["f1".to_string()]);

    let mut c = tokio::net::TcpStream::connect(("127.0.0.1", local_port)).await.unwrap();
    c.write_all(b"ping through tunnel").await.unwrap();
    let mut buf = [0u8; 19];
    tokio::time::timeout(Duration::from_secs(5), c.read_exact(&mut buf)).await.unwrap().unwrap();
    assert_eq!(&buf, b"ping through tunnel");

    sessions.forward_stop("f1");
    wait_for("forward stop", || sessions.forward_active().is_empty()).await;
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert!(tokio::net::TcpStream::connect(("127.0.0.1", local_port)).await.is_err(), "port closed after stop");
}
