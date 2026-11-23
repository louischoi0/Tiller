//! Persistent data: hosts, key metadata, snippets and forwards live in `data.json`,
//! private keys in `keys/<id>`, server fingerprints in `known_hosts.json`.
//! Secrets (host passwords, key passphrases) go to the OS credential store.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const SERVICE: &str = "sshdeck";
/// Data folder name under the OS app-data directory. Fixed (it was the original
/// identifier), so upgrades and the dev build always find the same hosts.
pub const DATA_FOLDER: &str = "com.sshdeck.app";

// Every field has a default so a file written by an older or newer Tiller still loads
// (missing fields are filled in, unknown ones are ignored) instead of being thrown away.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Host {
    pub id: String,
    pub name: String,
    pub address: String,
    pub port: u16,
    pub username: String,
    pub auth: String, // "password" | "key"
    pub key_id: Option<String>,
    /// Collection (folder) the host sits in; `None` = top level.
    pub collection_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub collapsed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub id: String,
    pub name: String,
    pub algorithm: String,
    pub public_key: String,
    pub encrypted: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Forward {
    pub id: String,
    pub name: String,
    pub host_id: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

impl Default for Host {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            address: String::new(),
            port: 22,
            username: String::new(),
            auth: "password".into(),
            key_id: None,
            collection_id: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Data {
    pub collections: Vec<Collection>,
    pub hosts: Vec<Host>,
    pub keys: Vec<KeyInfo>,
    pub snippets: Vec<Snippet>,
    pub forwards: Vec<Forward>,
    /// UI preferences; the frontend owns this schema.
    pub settings: serde_json::Value,
}

pub struct Store {
    dir: PathBuf,
    data: Mutex<Data>,
    known: Mutex<HashMap<String, String>>,
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("Save failed: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Save failed: {e}"))
}

fn bak_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".bak");
    path.with_file_name(name)
}

/// `None`: the file doesn't exist. `Some(Err)`: it exists but can't be read or parsed.
fn try_read<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<Result<T, String>> {
    match fs::read(path) {
        Ok(b) => Some(serde_json::from_slice(&b).map_err(|e| e.to_string())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => Some(Err(e.to_string())),
    }
}

/// Loads a data file without ever losing it: an unreadable file is kept aside as
/// `<name>.broken-<unix time>` and the last backup is used instead.
fn load<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    match try_read(path) {
        Some(Ok(v)) => return v,
        Some(Err(e)) => {
            let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let mut name = path.file_name().unwrap_or_default().to_os_string();
            name.push(format!(".broken-{secs}"));
            let _ = fs::copy(path, path.with_file_name(name));
            eprintln!("{}: {e}; using the backup", path.display());
        }
        None => {}
    }
    match try_read(&bak_path(path)) {
        Some(Ok(v)) => v,
        _ => T::default(),
    }
}

/// Saves `value`, first keeping the previous file as `<name>.bak`.
fn save<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    if matches!(try_read::<serde_json::Value>(path), Some(Ok(_))) {
        let _ = fs::copy(path, bak_path(path));
    }
    write_atomic(path, &json)
}

impl Store {
    pub fn open(dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(dir.join("keys")).map_err(|e| format!("Can't create the data folder: {e}"))?;
        let data = load(&dir.join("data.json"));
        let known = load(&dir.join("known_hosts.json"));
        Ok(Self { dir, data: Mutex::new(data), known: Mutex::new(known) })
    }

    /// Current data, re-read from disk so changes saved by another Tiller window
    /// (e.g. the dev build next to the installed app) show up.
    pub fn snapshot(&self) -> Data {
        let mut data = self.data.lock().unwrap();
        if let Some(Ok(d)) = try_read(&self.dir.join("data.json")) {
            *data = d;
        }
        data.clone()
    }

    /// Applies `f` to the data and persists it. The file is re-read first, so a save
    /// only changes what `f` changes and never rolls back another window's edits.
    pub fn update(&self, f: impl FnOnce(&mut Data)) -> Result<(), String> {
        let path = self.dir.join("data.json");
        let mut data = self.data.lock().unwrap();
        if let Some(Ok(d)) = try_read(&path) {
            *data = d;
        }
        f(&mut data);
        save(&path, &*data)
    }

    pub fn host(&self, id: &str) -> Result<Host, String> {
        self.data.lock().unwrap().hosts.iter().find(|h| h.id == id).cloned().ok_or_else(|| "Host not found.".into())
    }

    pub fn forward(&self, id: &str) -> Result<Forward, String> {
        self.data.lock().unwrap().forwards.iter().find(|f| f.id == id).cloned().ok_or_else(|| "Forward not found.".into())
    }

    pub fn key_path(&self, key_id: &str) -> PathBuf {
        // Ids are generated by us, but never let one escape the keys folder.
        let safe: String = key_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
        self.dir.join("keys").join(safe)
    }

    pub fn known_fingerprint(&self, host_id: &str) -> Option<String> {
        self.known.lock().unwrap().get(host_id).cloned()
    }

    pub fn set_known_fingerprint(&self, host_id: &str, fp: Option<String>) -> Result<(), String> {
        let path = self.dir.join("known_hosts.json");
        let mut known = self.known.lock().unwrap();
        if let Some(Ok(k)) = try_read(&path) {
            *known = k;
        }
        match fp {
            Some(fp) => known.insert(host_id.to_string(), fp),
            None => known.remove(host_id),
        };
        save(&path, &*known)
    }
}

// ---- OS credential store --------------------------------------------------

fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|e| format!("Credential store error: {e}"))
}

pub fn secret_get(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Credential store error: {e}")),
    }
}

pub fn secret_set(account: &str, value: Option<&str>) -> Result<(), String> {
    let e = entry(account)?;
    match value {
        Some(v) => e.set_password(v).map_err(|e| format!("Credential store error: {e}")),
        None => match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Credential store error: {e}")),
        },
    }
}

pub fn host_account(host_id: &str) -> String {
    format!("host:{host_id}")
}

pub fn key_account(key_id: &str) -> String {
    format!("key:{key_id}")
}
