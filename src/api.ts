import { invoke } from "@tauri-apps/api/core";

export interface Collection {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface Host {
  id: string;
  name: string;
  address: string;
  port: number;
  username: string;
  auth: "password" | "key";
  keyId: string | null;
  collectionId: string | null;
}

export interface KeyInfo {
  id: string;
  name: string;
  algorithm: string;
  publicKey: string;
  encrypted: boolean;
}

export interface HighlightSettings {
  enabled: boolean;
  /** #rrggbb per category. */
  colors: { error: string; warning: string; ok: string; info: string; debug: string; address: string };
}

export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  /** Terminal color theme id (see themes.ts); "auto" follows the app theme. */
  theme: string;
  highlight: HighlightSettings;
}

export type AppTheme = "system" | "light" | "dark";

export interface Settings {
  appearance: { theme: AppTheme; sidebarOpen: boolean };
  terminal: TerminalSettings;
  /** Per-command key binding overrides (see commands.ts); absent = default. */
  keybindings: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  keybindings: {},
  appearance: { theme: "system", sidebarOpen: true },
  terminal: {
    fontSize: 14,
    fontFamily: "",
    cursorStyle: "block",
    cursorBlink: true,
    scrollback: 10000,
    theme: "auto",
    highlight: {
      enabled: true,
      colors: { error: "#f2564d", warning: "#f0a53a", ok: "#3ecf6e", info: "#4c9aff", debug: "#b48cf2", address: "#e06fb0" },
    },
  },
};

/** Fills in defaults for anything missing from saved settings. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  return {
    keybindings: r.keybindings && typeof r.keybindings === "object" ? r.keybindings : {},
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(r.appearance ?? {}) },
    terminal: {
      ...DEFAULT_SETTINGS.terminal,
      ...(r.terminal ?? {}),
      highlight: {
        ...DEFAULT_SETTINGS.terminal.highlight,
        ...(r.terminal?.highlight ?? {}),
        colors: { ...DEFAULT_SETTINGS.terminal.highlight.colors, ...(r.terminal?.highlight?.colors ?? {}) },
      },
    },
  };
}

export interface Store {
  collections: Collection[];
  hosts: Host[];
  keys: KeyInfo[];
  settings: unknown;
}

export const newId = () => crypto.randomUUID();

export const api = {
  storeGet: () => invoke<Store>("store_get"),
  librarySave: (collections: Collection[], hosts: Host[]) => invoke<void>("library_save", { collections, hosts }),
  settingsSave: (settings: Settings) => invoke<void>("settings_save", { settings }),

  hostHasPassword: (hostId: string) => invoke<boolean>("host_has_password", { hostId }),
  hostSetPassword: (hostId: string, password: string | null) =>
    invoke<void>("host_set_password", { hostId, password }),
  hostForgetKey: (hostId: string) => invoke<void>("host_forget_key", { hostId }),

  keyGenerate: (name: string) => invoke<KeyInfo>("key_generate", { name }),
  keyImport: (name: string, pem: string, passphrase: string | null) =>
    invoke<KeyInfo>("key_import", { name, pem, passphrase }),
  keyDelete: (id: string) => invoke<void>("key_delete", { id }),

  // Resolves to the server fingerprint when it was seen (and trusted) for the first time.
  sshConnect: (sessionId: string, hostId: string, cols: number, rows: number, password?: string) =>
    invoke<string | null>("ssh_connect", { sessionId, hostId, cols, rows, password: password ?? null }),
  sshWrite: (sessionId: string, data: string) => invoke<void>("ssh_write", { sessionId, data }),
  sshResize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("ssh_resize", { sessionId, cols, rows }),
  sshClose: (sessionId: string) => invoke<void>("ssh_close", { sessionId }),
};
