// Every keyboard-driven action is a command. Commands have default key bindings that
// the user can override in Settings > Keyboard, and they are what the command palette lists.
import { isMac } from "./terminals";

/** "global" works everywhere, including inside the terminal; "hosts" only while the host list has focus. */
export type Scope = "global" | "hosts";

export interface CommandDef {
  id: string;
  title: string;
  group: string;
  scope: Scope;
  /** Default bindings. A binding is one chord ("Alt+H") or a sequence of chords ("D D"). */
  keys: string[];
}

const g = (id: string, title: string, group: string, ...keys: string[]): CommandDef => ({ id, title, group, scope: "global", keys });
const h = (id: string, title: string, ...keys: string[]): CommandDef => ({ id, title, group: "Host list", scope: "hosts", keys });

export const COMMANDS: CommandDef[] = [
  g("palette.open", "Show command palette", "General", "Ctrl+Shift+P"),
  g("settings.open", "Open settings", "General", "Alt+,"),
  g("window.fullscreen", "Toggle full screen", "General", "F11"),
  g("sidebar.toggle", "Toggle sidebar", "General", "Alt+B"),
  g("hosts.focus", "Focus host list", "General", "Alt+E"),

  g("pane.splitRight", "Split pane right", "Panes", "Alt+V"),
  g("pane.splitDown", "Split pane down", "Panes", "Alt+S"),
  g("pane.close", "Close pane", "Panes", "Alt+Q"),
  g("pane.focusLeft", "Focus pane on the left", "Panes", "Alt+H"),
  g("pane.focusDown", "Focus pane below", "Panes", "Alt+J"),
  g("pane.focusUp", "Focus pane above", "Panes", "Alt+K"),
  g("pane.focusRight", "Focus pane on the right", "Panes", "Alt+L"),

  g("tab.prev", "Previous tab", "Tabs", "Alt+["),
  g("tab.next", "Next tab", "Tabs", "Alt+]"),
  // Tabs are numbered from 0, like the label shown on each tab.
  ...Array.from({ length: 10 }, (_, i) => g(`tab.${i}`, `Go to tab ${i}`, "Tabs", `Ctrl+Shift+${i}`, `Alt+${i}`)),

  h("list.down", "Move down", "J", "ArrowDown"),
  h("list.up", "Move up", "K", "ArrowUp"),
  h("list.top", "Go to top", "G G"),
  h("list.bottom", "Go to bottom", "Shift+G"),
  h("list.open", "Connect / toggle collection", "Enter"),
  h("list.expand", "Expand collection (or connect)", "L"),
  h("list.collapse", "Collapse collection", "H"),
  h("host.new", "New host", "A"),
  h("collection.new", "New collection", "Shift+A"),
  h("list.edit", "Edit host / rename collection", "E"),
  h("list.delete", "Delete host or collection", "D D"),
  h("list.back", "Back to terminal", "Escape"),
];

export type Keybindings = Record<string, string[]>;

/** Effective bindings of a command: the user's override if there is one, else the defaults. */
export function bindingsOf(id: string, overrides: Keybindings): string[] {
  return overrides[id] ?? COMMANDS.find((c) => c.id === id)?.keys ?? [];
}

const CODE_KEYS: Record<string, string> = {
  Comma: ",", Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  Semicolon: ";", Quote: "'", Backquote: "`", Minus: "-", Equal: "=", Space: "Space",
};

/** Turns a keydown into a chord string such as "Ctrl+Shift+P"; null for a bare modifier key. */
export function chordFromEvent(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(e.key)) return null;
  // Physical key where possible: Option on macOS and Shift change what e.key reports.
  let base: string;
  if (/^Key[A-Z]$/.test(e.code)) base = e.code[3];
  else if (/^Digit\d$/.test(e.code)) base = e.code[5];
  else if (/^Numpad\d$/.test(e.code)) base = e.code[6]; // numeric keypad counts as the same digit
  else if (CODE_KEYS[e.code]) base = CODE_KEYS[e.code];
  else base = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
  return [...mods, base].join("+");
}

/**
 * Windows, with NumLock on, reports Shift+keypad-digit as an unshifted navigation key
 * (Shift+Numpad1 arrives as "End" with shiftKey false). For such an event this returns
 * the chord the user actually pressed, with Shift put back; otherwise null.
 */
export function numpadShiftChord(e: KeyboardEvent): string | null {
  if (!/^Numpad\d$/.test(e.code) || e.shiftKey || /^\d$/.test(e.key)) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", "Shift", e.metaKey && "Meta"].filter(Boolean);
  return [...mods, e.code[6]].join("+");
}

/** True if the chord is safe to use everywhere, i.e. it can't be ordinary typing in the terminal. */
export function isGlobalSafe(chord: string): boolean {
  return /(^|\+)(Ctrl|Alt|Meta)\+/.test(chord + "+") || /^(Shift\+)?F\d{1,2}$/.test(chord);
}

const MAC_MODS: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" };
const NAMES: Record<string, string> = { ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→", Escape: "esc", Enter: "enter" };

function formatChord(chord: string): string {
  const parts = chord.split("+");
  const base = parts.pop() ?? "";
  // vim style for plain letters: "J" -> j, "Shift+G" -> G
  if (/^[A-Z]$/.test(base)) {
    if (parts.length === 0) return base.toLowerCase();
    if (parts.length === 1 && parts[0] === "Shift") return base;
  }
  const key = NAMES[base] ?? (/^[A-Z]$/.test(base) ? base.toLowerCase() : base);
  if (isMac) return parts.map((m) => MAC_MODS[m] ?? m).join("") + key;
  return [...parts, key].join("+");
}

/** Human-readable form of a binding, e.g. "Alt+h", "gg", "Ctrl+Shift+p". */
export function formatKeys(binding: string): string {
  if (!binding) return "";
  const chords = binding.split(" ").map(formatChord);
  return chords.every((c) => c.length === 1) ? chords.join("") : chords.join(" ");
}

/** While true the app's key dispatcher stands down (Settings is recording a new shortcut). */
export const keyCapture = { active: false };
