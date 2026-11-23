# Tiller

Keyboard-first SSH client for Windows and macOS (Tauri + React + Rust).

- Host list with collections, tabs and split panes, vim-style keys
- Command palette (`Ctrl+Shift+P`), every shortcut rebindable
- Light/dark app theme, terminal color themes, keyword highlighting
- Passwords and key passphrases in the OS credential store; server fingerprints checked on every connect

Design rules: [DESIGN.md](DESIGN.md)

## Develop

```
npm install
npm run app:dev
```

`app:dev` runs as "Tiller Dev" (identifier `com.sshdeck.app.dev`) with its own data folder, so it starts with an empty host list and can run beside the installed app. Plain `npm run tauri dev` uses the installed app's data and cannot run while it is open.

Test SSH server (password `test`, port 2223): `cargo run --example test_server` in `src-tauri`.
