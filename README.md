# Tiller

Keyboard-first SSH client for Windows and macOS (Tauri + React + Rust).

- Host list with collections, tabs and split panes, vim-style keys
- Command palette (`Ctrl+Shift+P`), every shortcut rebindable
- Light/dark app theme, terminal color themes, keyword highlighting
- Passwords and key passphrases in the OS credential store; server fingerprints checked on every connect

Design rules: [DESIGN.md](DESIGN.md)

## Data

Hosts, keys and fingerprints are kept in a fixed folder that does not depend on the version: `%APPDATA%\com.sshdeck.app` on Windows, `~/Library/Application Support/com.sshdeck.app` on macOS. Upgrading or reinstalling keeps them. Passwords are in the OS credential store. Every save re-reads the file first and keeps the previous copy as `data.json.bak`. A file that can't be read is never overwritten: it is set aside as `data.json.broken-<time>` and the backup is loaded. Windows reload the host list when focused, so two Tiller windows don't undo each other's edits.

## Develop

```
npm install
npm run app:dev
```

`app:dev` runs as "Tiller Dev" (identifier `com.sshdeck.app.dev`) with its own WebView folder, so it can run beside the installed app. It reads and writes the installed app's hosts, keys and fingerprints. Plain `npm run tauri dev` uses the installed app's data and cannot run while it is open.

Test SSH server (password `test`, port 2223): `cargo run --example test_server` in `src-tauri`.
