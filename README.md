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
npm run tauri dev
```

Test SSH server (password `test`, port 2223): `cargo run --example test_server` in `src-tauri`.
