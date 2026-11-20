// Terminal instances live outside React so that re-arranging the split layout
// (which remounts components) never destroys a live session.
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { listen } from "@tauri-apps/api/event";
import { api, DEFAULT_SETTINGS, Host, newId, TerminalSettings } from "./api";
import { TERMINAL_THEMES, TermTheme } from "./themes";
import { Highlighter } from "./highlight";

export type PaneStatus = "idle" | "connecting" | "password" | "connected" | "closed";

export const isMac = navigator.userAgent.includes("Mac");

interface Pane {
  id: string;
  hostId: string;
  label: string;
  term: Terminal;
  fit: FitAddon;
  hl: Highlighter;
  el: HTMLDivElement;
  opened: boolean;
  status: PaneStatus;
  pwBuf: string;
}

const panes = new Map<string, Pane>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const getStatus = (id: string): PaneStatus => panes.get(id)?.status ?? "closed";
export const getLabel = (id: string): string => panes.get(id)?.label ?? "";
export const getHostId = (id: string): string | undefined => panes.get(id)?.hostId;

// ---- settings -------------------------------------------------------------

const BASE_FONT = '"Source Code Pro Variable", "Source Code Pro", "Cascadia Mono", Consolas, "SF Mono", Menlo, "D2Coding", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", monospace';
let termSettings: TerminalSettings = DEFAULT_SETTINGS.terminal;

function termOptions(s: TerminalSettings) {
  const custom = s.fontFamily.trim();
  return {
    fontSize: s.fontSize,
    fontFamily: custom ? `"${custom}", ${BASE_FONT}` : BASE_FONT,
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    scrollback: s.scrollback,
  };
}

/** Applies terminal settings to every open terminal and to terminals opened later. */
export function applyTerminalSettings(s: TerminalSettings) {
  const highlightChanged = JSON.stringify(s.highlight) !== JSON.stringify(termSettings.highlight);
  termSettings = s;
  for (const p of panes.values()) {
    Object.assign(p.term.options, termOptions(s));
    safeFit(p);
    if (highlightChanged) p.hl.setConfig(s.highlight);
  }
}

let termColors: TermTheme["colors"] = TERMINAL_THEMES[0].colors;

/** Applies a color theme to every open terminal (and the pane background around it). */
export function applyTerminalColors(colors: TermTheme["colors"]) {
  termColors = colors;
  document.documentElement.style.setProperty("--term-bg", colors.background);
  for (const p of panes.values()) {
    p.term.options.theme = { ...colors };
    p.el.style.background = colors.background;
  }
}

// ---- helpers --------------------------------------------------------------

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function setStatus(p: Pane, s: PaneStatus) {
  p.status = s;
  notify();
}

let ready: Promise<void> | null = null;
function ensureListeners() {
  if (!ready) {
    ready = Promise.all([
      listen<{ id: string; data: string }>("ssh-data", (e) => {
        panes.get(e.payload.id)?.term.write(decode(e.payload.data));
      }),
      listen<{ id: string; message: string }>("ssh-exit", (e) => {
        const p = panes.get(e.payload.id);
        if (!p || p.status !== "connected") return;
        p.term.write(`\r\n${dim(`[disconnected: ${e.payload.message}] press Enter to reconnect`)}\r\n`);
        setStatus(p, "closed");
      }),
    ]).then(() => undefined);
  }
  return ready;
}

// ---- connection flow ------------------------------------------------------

function askPassword(p: Pane) {
  p.pwBuf = "";
  p.term.write(`${p.label}'s password: `);
  setStatus(p, "password");
}

async function connect(p: Pane, password?: string) {
  setStatus(p, "connecting");
  p.term.write(dim(`Connecting to ${p.label}...`) + "\r\n");
  try {
    await ensureListeners();
    const newFingerprint = await api.sshConnect(p.id, p.hostId, p.term.cols, p.term.rows, password);
    if (!panes.has(p.id)) {
      api.sshClose(p.id).catch(() => {});
      return;
    }
    if (newFingerprint) p.term.write(dim(`First connection to this server. Fingerprint saved: ${newFingerprint}`) + "\r\n");
    setStatus(p, "connected");
  } catch (e) {
    if (!panes.has(p.id)) return;
    const msg = String(e);
    if (msg === "PASSWORD_REQUIRED") {
      askPassword(p);
    } else if (msg === "AUTH_FAILED_PASSWORD") {
      p.term.write(red("Incorrect password.") + "\r\n");
      askPassword(p);
    } else {
      p.term.write(red(msg) + "\r\n" + dim("Press Enter to retry") + "\r\n");
      setStatus(p, "closed");
    }
  }
}

function onInput(p: Pane, data: string) {
  if (p.status === "connected") {
    api.sshWrite(p.id, data).catch(() => {});
  } else if (p.status === "password") {
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const pw = p.pwBuf;
        p.pwBuf = "";
        p.term.write("\r\n");
        connect(p, pw);
        return;
      } else if (ch === "\x7f" || ch === "\b") {
        p.pwBuf = p.pwBuf.slice(0, -1);
      } else if (ch === "\x03") {
        p.pwBuf = "";
        p.term.write("\r\n" + dim("Cancelled. Press Enter to retry") + "\r\n");
        setStatus(p, "closed");
        return;
      } else if (ch >= " ") {
        p.pwBuf += ch;
      }
    }
  } else if (p.status === "closed" && data === "\r") {
    connect(p);
  }
}

// ---- pane lifecycle -------------------------------------------------------

export function createPane(host: Host): string {
  const id = newId();
  const el = document.createElement("div");
  el.className = "term-host";
  // The host element paints the whole pane (text area and inset) in the theme background.
  el.style.background = termColors.background;
  const term = new Terminal({
    ...termOptions(termSettings),
    theme: { ...termColors },
    // Themes only supply text colors; keep any of them readable on the app background.
    minimumContrastRatio: 3,
    // Needed for decorations, which keyword highlighting is drawn with (highlight.ts).
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const p: Pane = {
    id,
    hostId: host.id,
    label: `${host.username}@${host.address}`,
    term,
    fit,
    hl: new Highlighter(term, termSettings.highlight),
    el,
    opened: false,
    status: "idle",
    pwBuf: "",
  };
  term.onData((d) => onInput(p, d));
  term.onResize(({ cols, rows }) => {
    if (p.status === "connected") api.sshResize(p.id, cols, rows).catch(() => {});
  });
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== "keydown") return true;
    // macOS: Cmd+C / Cmd+V go through the app's Edit menu (native copy/paste).
    if (isMac && ev.metaKey) return false;
    const key = ev.key.toLowerCase();
    if (ev.ctrlKey && ev.shiftKey && key === "c") {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      ev.preventDefault();
      return false;
    }
    // Let the webview's native paste event reach xterm instead of sending ^V.
    if ((ev.ctrlKey && ev.shiftKey && key === "v") || (ev.shiftKey && ev.key === "Insert")) return false;
    return true;
  });
  panes.set(id, p);
  return id;
}

function safeFit(p: Pane) {
  if (p.el.clientWidth > 0 && p.el.clientHeight > 0) {
    try {
      p.fit.fit();
    } catch {
      /* not laid out yet */
    }
  }
}

/** Mounts the pane's terminal into `container`; returns a detach function. */
export function attach(id: string, container: HTMLElement): () => void {
  const p = panes.get(id);
  if (!p) return () => {};
  container.appendChild(p.el);
  if (!p.opened) {
    p.term.open(p.el);
    p.opened = true;
  }
  const ro = new ResizeObserver(() => safeFit(p));
  ro.observe(container);
  safeFit(p);
  if (p.status === "idle") connect(p);
  return () => {
    ro.disconnect();
    if (p.el.parentElement === container) container.removeChild(p.el);
  };
}

export function disposePane(id: string) {
  const p = panes.get(id);
  if (!p) return;
  panes.delete(id);
  api.sshClose(id).catch(() => {});
  p.hl.dispose();
  p.term.dispose();
  p.el.remove();
  notify();
}

export function focusPane(id: string) {
  panes.get(id)?.term.focus();
}
