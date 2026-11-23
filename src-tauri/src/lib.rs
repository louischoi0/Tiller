pub mod ssh;
pub mod store;

use russh::keys::ssh_key::LineEnding;
use russh::keys::{Algorithm, PrivateKey};
use ssh::Sessions;
use std::sync::Arc;
use store::{Collection, Data, Forward, Host, KeyInfo, Snippet, Store};
use tauri::{AppHandle, Manager, State};

type Res<T> = Result<T, String>;

fn key_info(id: String, name: String, key: &PrivateKey, encrypted: bool) -> Res<KeyInfo> {
    let public = key.public_key().to_openssh().map_err(|e| e.to_string())?;
    Ok(KeyInfo {
        id,
        name,
        algorithm: key.algorithm().as_str().to_string(),
        public_key: format!("{public} tiller"),
        encrypted,
    })
}

#[tauri::command]
fn store_get(store: State<'_, Store>) -> Data {
    store.snapshot()
}

#[tauri::command]
fn hosts_save(store: State<'_, Store>, hosts: Vec<Host>) -> Res<()> {
    store.update(|d| d.hosts = hosts)
}

/// Saves collections and hosts together so moving/deleting a collection is one atomic write.
#[tauri::command]
fn library_save(store: State<'_, Store>, collections: Vec<Collection>, hosts: Vec<Host>) -> Res<()> {
    store.update(|d| {
        d.collections = collections;
        d.hosts = hosts;
    })
}

#[tauri::command]
fn settings_save(store: State<'_, Store>, settings: serde_json::Value) -> Res<()> {
    store.update(|d| d.settings = settings)
}

#[tauri::command]
fn snippets_save(store: State<'_, Store>, snippets: Vec<Snippet>) -> Res<()> {
    store.update(|d| d.snippets = snippets)
}

#[tauri::command]
fn forwards_save(store: State<'_, Store>, forwards: Vec<Forward>) -> Res<()> {
    store.update(|d| d.forwards = forwards)
}

#[tauri::command]
fn host_has_password(host_id: String) -> Res<bool> {
    Ok(store::secret_get(&store::host_account(&host_id))?.is_some())
}

#[tauri::command]
fn host_set_password(host_id: String, password: Option<String>) -> Res<()> {
    store::secret_set(&store::host_account(&host_id), password.as_deref())
}

#[tauri::command]
fn host_forget_key(store: State<'_, Store>, host_id: String) -> Res<()> {
    store.set_known_fingerprint(&host_id, None)
}

#[tauri::command]
fn key_generate(store: State<'_, Store>, name: String) -> Res<KeyInfo> {
    let key = PrivateKey::random(&mut russh::keys::key::safe_rng(), Algorithm::Ed25519)
        .map_err(|e| format!("Failed to generate key: {e}"))?;
    let id = uuid::Uuid::new_v4().to_string();
    let pem = key.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?;
    std::fs::write(store.key_path(&id), pem.as_bytes()).map_err(|e| format!("Failed to save key: {e}"))?;
    let info = key_info(id, name, &key, false)?;
    store.update(|d| d.keys.push(info.clone()))?;
    Ok(info)
}

#[tauri::command]
fn key_import(store: State<'_, Store>, name: String, pem: String, passphrase: Option<String>) -> Res<KeyInfo> {
    let passphrase = passphrase.filter(|p| !p.is_empty());
    let key = russh::keys::decode_secret_key(&pem, passphrase.as_deref()).map_err(|e| {
        if passphrase.is_none() {
            format!("Can't read the key. If it is passphrase-protected, enter the passphrase. ({e})")
        } else {
            format!("Can't read the key. Check the passphrase. ({e})")
        }
    })?;
    let id = uuid::Uuid::new_v4().to_string();
    std::fs::write(store.key_path(&id), pem.as_bytes()).map_err(|e| format!("Failed to save key: {e}"))?;
    if let Some(p) = &passphrase {
        store::secret_set(&store::key_account(&id), Some(p))?;
    }
    let info = key_info(id, name, &key, passphrase.is_some())?;
    store.update(|d| d.keys.push(info.clone()))?;
    Ok(info)
}

#[tauri::command]
fn key_delete(store: State<'_, Store>, id: String) -> Res<()> {
    let path = store.key_path(&id);
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("Failed to delete key file: {e}"))?;
    }
    store::secret_set(&store::key_account(&id), None)?;
    store.update(|d| d.keys.retain(|k| k.id != id))
}

#[tauri::command]
async fn ssh_connect(
    app: AppHandle,
    store: State<'_, Store>,
    sessions: State<'_, Arc<Sessions>>,
    session_id: String,
    host_id: String,
    cols: u32,
    rows: u32,
    password: Option<String>,
) -> Res<Option<String>> {
    sessions.connect(app.clone(), &store, session_id, host_id, cols, rows, password).await
}

#[tauri::command]
fn ssh_write(sessions: State<'_, Arc<Sessions>>, session_id: String, data: String) -> Res<()> {
    sessions.write(&session_id, data)
}

#[tauri::command]
fn ssh_resize(sessions: State<'_, Arc<Sessions>>, session_id: String, cols: u32, rows: u32) -> Res<()> {
    sessions.resize(&session_id, cols, rows)
}

#[tauri::command]
fn ssh_close(sessions: State<'_, Arc<Sessions>>, session_id: String) {
    sessions.close(&session_id)
}

#[tauri::command]
async fn forward_start(
    app: AppHandle,
    store: State<'_, Store>,
    sessions: State<'_, Arc<Sessions>>,
    forward_id: String,
) -> Res<()> {
    sessions.inner().clone().forward_start(app.clone(), &store, forward_id).await
}

#[tauri::command]
fn forward_stop(sessions: State<'_, Arc<Sessions>>, forward_id: String) {
    sessions.forward_stop(&forward_id)
}

#[tauri::command]
fn forward_active(sessions: State<'_, Arc<Sessions>>) -> Vec<String> {
    sessions.forward_active()
}

/// Opens a link from terminal output (Ctrl/Cmd+click) in the default browser.
/// Only http(s) links, so server output can't launch local files or other handlers.
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Res<()> {
    use tauri_plugin_opener::OpenerExt;
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("Only http and https links can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Hosts, keys and fingerprints live in one fixed folder (%APPDATA%\com.sshdeck.app,
            // ~/Library/Application Support/com.sshdeck.app). It doesn't depend on the version or
            // the build: the dev build (identifier "<release>.dev", own WebView folder) and every
            // release read the same files. Passwords are in the OS credential store either way.
            let dir = app.path().data_dir()?.join(store::DATA_FOLDER);
            app.manage(Store::open(dir)?);
            app.manage(Arc::new(Sessions::default()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store_get,
            hosts_save,
            library_save,
            settings_save,
            snippets_save,
            forwards_save,
            host_has_password,
            host_set_password,
            host_forget_key,
            key_generate,
            key_import,
            key_delete,
            ssh_connect,
            ssh_write,
            ssh_resize,
            ssh_close,
            forward_start,
            forward_stop,
            forward_active,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
