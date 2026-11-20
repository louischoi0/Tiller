import { ReactNode, useEffect, useState } from "react";
import { bindingsOf, chordFromEvent, COMMANDS, formatKeys, isGlobalSafe, keyCapture } from "./commands";
import { api, AppTheme, Host, KeyInfo, Settings, TerminalSettings } from "./api";
import { KeyDialog } from "./dialogs";
import { AUTO_THEME, effectiveColors, resolveTerminalTheme, TERMINAL_THEMES, TermTheme } from "./themes";

type Section = "appearance" | "terminal" | "keyboard" | "keys" | "about";

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 1.5a6.5 6.5 0 010 13z" className="fill" />
      </svg>
    ),
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg viewBox="0 0 16 16">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
        <path d="M4.5 6.5l2 1.5-2 1.5M8 10h3.5" />
      </svg>
    ),
  },
  {
    id: "keyboard",
    label: "Keyboard",
    icon: (
      <svg viewBox="0 0 16 16">
        <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
        <path d="M4.5 6.5h.01M7 6.5h.01M9.5 6.5h.01M12 6.5h.01M5 9.5h6" />
      </svg>
    ),
  },
  {
    id: "keys",
    label: "SSH keys",
    icon: (
      <svg viewBox="0 0 16 16">
        <circle cx="5.5" cy="10.5" r="3" />
        <path d="M7.7 8.3L13.5 2.5M11 5l1.8 1.8M12.5 3.5l1.5 1.5" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 7.2V11.5M8 4.6v.1" />
      </svg>
    ),
  },
];

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="set-group">
      {title && <h3>{title}</h3>}
      <div className="set-box">{children}</div>
    </section>
  );
}

function Item({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** Miniature window used to preview the app theme. */
function WindowThumb({ variant }: { variant: "light" | "dark" | "system" }) {
  return (
    <div className={`win-thumb ${variant}`}>
      <div className="wt-half wt-light">
        <i className="wt-side" />
        <i className="wt-bar" />
        <i className="wt-line" />
        <i className="wt-line short" />
      </div>
      <div className="wt-half wt-dark">
        <i className="wt-side" />
        <i className="wt-bar" />
        <i className="wt-line" />
        <i className="wt-line short" />
      </div>
    </div>
  );
}

function AppearanceSection({ value, onChange }: { value: AppTheme; onChange: (t: AppTheme) => void }) {
  const options: { id: AppTheme; label: string }[] = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];
  return (
    <Group title="App theme">
      <div className="theme-picker">
        {options.map((o) => (
          <button key={o.id} className={`theme-option ${value === o.id ? "on" : ""}`} onClick={() => onChange(o.id)}>
            <WindowThumb variant={o.id} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <div className="set-row">
        <div className="set-text">
          <small>System follows the operating system's light/dark setting.</small>
        </div>
      </div>
    </Group>
  );
}

/** Small terminal preview painted with a theme's palette. */
function TermPreview({ theme, dark }: { theme: TermTheme; dark: boolean }) {
  const c = effectiveColors(theme, dark);
  return (
    <div className="term-preview" style={{ background: c.background, color: c.foreground }}>
      <div>
        <span style={{ color: c.green }}>user@server</span>
        <span style={{ color: c.foreground }}>:</span>
        <span style={{ color: c.blue }}>~</span>
        <span>$ ls</span>
      </div>
      <div>
        <span style={{ color: c.blue }}>app</span> <span style={{ color: c.cyan }}>logs</span>{" "}
        <span style={{ color: c.yellow }}>run.sh</span> <span style={{ color: c.red }}>.env</span>
      </div>
      <div className="tp-swatches">
        {[c.red, c.green, c.yellow, c.blue, c.magenta, c.cyan].map((col, i) => (
          <i key={i} style={{ background: col }} />
        ))}
      </div>
    </div>
  );
}

function TerminalSection({
  value,
  dark,
  onChange,
}: {
  value: TerminalSettings;
  dark: boolean;
  onChange: (t: TerminalSettings) => void;
}) {
  const set = <K extends keyof TerminalSettings>(k: K, v: TerminalSettings[K]) => onChange({ ...value, [k]: v });
  const choices = [
    { id: AUTO_THEME, name: "Match app", theme: resolveTerminalTheme(AUTO_THEME, dark) },
    ...TERMINAL_THEMES.map((t) => ({ id: t.id, name: t.name, theme: t })),
  ];
  return (
    <>
      <Group title="Color theme">
        <div className="term-themes">
          {choices.map((ch) => (
            <button
              key={ch.id}
              className={`term-theme ${value.theme === ch.id ? "on" : ""}`}
              onClick={() => set("theme", ch.id)}
            >
              <TermPreview theme={ch.theme} dark={dark} />
              <span>{ch.name}</span>
            </button>
          ))}
        </div>
      </Group>
      <section className="set-group">
        <h3>Keyword highlighting</h3>
        <div className={`set-box ${value.highlight.enabled ? "" : "off"}`}>
          <Item label="Highlight keywords in output" sub="Colors matches on top of the output; full-screen programs such as vim are left alone.">
            <Toggle
              on={value.highlight.enabled}
              onChange={(enabled) => set("highlight", { ...value.highlight, enabled })}
            />
          </Item>
          {(
            [
              ["error", "Error", "error, failed, fatal, denied"],
              ["warning", "Warning", "warn, warning, deprecated"],
              ["ok", "OK", "ok, success, passed, done, active"],
              ["info", "Info", "info, notice"],
              ["debug", "Debug", "debug, trace, verbose"],
              ["address", "IP address & MAC", "192.168.0.10, 10.0.0.1:22, aa:bb:cc:dd:ee:ff"],
            ] as const
          ).map(([key, label, sample]) => (
            <Item key={key} label={label} sub={sample}>
              <input
                type="color"
                className="swatch"
                value={value.highlight.colors[key]}
                disabled={!value.highlight.enabled}
                onChange={(e) =>
                  set("highlight", { ...value.highlight, colors: { ...value.highlight.colors, [key]: e.target.value } })
                }
              />
            </Item>
          ))}
        </div>
      </section>
      <Group title="Font">
        <Item label="Font size">
          <div className="stepper">
            <button onClick={() => set("fontSize", Math.max(9, value.fontSize - 1))}>−</button>
            <span>{value.fontSize}</span>
            <button onClick={() => set("fontSize", Math.min(28, value.fontSize + 1))}>+</button>
          </div>
        </Item>
        <Item label="Font family" sub="Leave empty for the built-in Source Code Pro.">
          <input
            className="set-input"
            value={value.fontFamily}
            placeholder="Source Code Pro"
            onChange={(e) => set("fontFamily", e.target.value)}
          />
        </Item>
      </Group>
      <Group title="Cursor">
        <Item label="Style">
          <div className="segmented">
            {(
              [
                ["block", "Block"],
                ["bar", "Bar"],
                ["underline", "Underline"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} className={value.cursorStyle === v ? "on" : ""} onClick={() => set("cursorStyle", v)}>
                {l}
              </button>
            ))}
          </div>
        </Item>
        <Item label="Blink">
          <Toggle on={value.cursorBlink} onChange={(v) => set("cursorBlink", v)} />
        </Item>
      </Group>
      <Group title="Buffer">
        <Item label="Scrollback" sub="Lines of output kept in history">
          <select className="set-select" value={value.scrollback} onChange={(e) => set("scrollback", Number(e.target.value))}>
            {[1000, 5000, 10000, 50000, 100000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()} lines
              </option>
            ))}
          </select>
        </Item>
      </Group>
    </>
  );
}

function KeysSection({
  keys,
  hosts,
  onKeysChange,
  onToast,
}: {
  keys: KeyInfo[];
  hosts: Host[];
  onKeysChange: (keys: KeyInfo[]) => void;
  onToast: (msg: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const remove = async (k: KeyInfo) => {
    const users = hosts.filter((h) => h.keyId === k.id).length;
    const warn = users ? `\n${users} host(s) using this key will no longer be able to connect.` : "";
    if (!confirm(`Delete key '${k.name}'? The private key file is deleted too and this can't be undone.${warn}`)) return;
    try {
      await api.keyDelete(k.id);
      onKeysChange(keys.filter((x) => x.id !== k.id));
    } catch (e) {
      onToast(String(e));
    }
  };
  return (
    <>
      <Group>
        {keys.length === 0 && <div className="set-empty">No keys yet.</div>}
        {keys.map((k) => (
          <div className="set-row" key={k.id}>
            <div className="set-text">
              <span>{k.name}</span>
              <small>
                {k.algorithm}
                {k.encrypted ? " · encrypted" : ""} · used by {hosts.filter((h) => h.keyId === k.id).length} host(s)
              </small>
            </div>
            <div className="set-control">
              <button
                className="btn small"
                onClick={() =>
                  navigator.clipboard.writeText(k.publicKey).then(
                    () => onToast("Public key copied."),
                    () => onToast("Couldn't copy to the clipboard."),
                  )
                }
              >
                Copy public key
              </button>
              <button className="btn small danger" onClick={() => remove(k)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </Group>
      <div className="set-footer">
        <span className="muted">Add a public key to the server's ~/.ssh/authorized_keys to connect with it.</span>
        <button className="btn" onClick={() => setAdding(true)}>
          Add key…
        </button>
      </div>
      {adding && <KeyDialog onDone={(k) => onKeysChange([...keys, k])} onClose={() => setAdding(false)} />}
    </>
  );
}

function KeyboardSection({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const overrides = settings.keybindings;
  const [recording, setRecording] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!recording) return;
    const cmd = COMMANDS.find((c) => c.id === recording)!;
    keyCapture.active = true;
    const onKey = (e: KeyboardEvent) => {
      const chord = chordFromEvent(e);
      if (!chord) return; // still holding modifiers
      e.preventDefault();
      e.stopPropagation();
      if (chord === "Escape") return setRecording(null);
      if (cmd.scope === "global" && !isGlobalSafe(chord)) {
        return setNote(`"${cmd.title}" works inside the terminal too, so it needs Ctrl, Alt or a function key.`);
      }
      // One key, one command: take the chord away from anything else that had it.
      const next = { ...overrides, [cmd.id]: [chord] };
      const taken: string[] = [];
      for (const other of COMMANDS) {
        if (other.id === cmd.id) continue;
        const keys = bindingsOf(other.id, overrides);
        if (keys.includes(chord)) {
          next[other.id] = keys.filter((k) => k !== chord);
          taken.push(other.title);
        }
      }
      onSettings({ ...settings, keybindings: next });
      setNote(taken.length ? `${formatKeys(chord)} was removed from: ${taken.join(", ")}.` : "");
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      keyCapture.active = false;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [recording, overrides, settings, onSettings]);

  const reset = (id: string) => {
    const next = { ...overrides };
    delete next[id];
    onSettings({ ...settings, keybindings: next });
  };
  const groups = [...new Set(COMMANDS.map((c) => c.group))];

  return (
    <>
      {note && <p className="set-note">{note}</p>}
      {groups.map((group) => (
        <Group key={group} title={group}>
          {COMMANDS.filter((c) => c.group === group).map((c) => {
            const keys = bindingsOf(c.id, overrides);
            return (
              <div className="set-row key-row" key={c.id}>
                <div className="set-text">
                  <span>{c.title}</span>
                </div>
                <div className="set-control">
                  {recording === c.id ? (
                    <span className="recording">Press keys… (esc to cancel)</span>
                  ) : (
                    <>
                      {keys.length === 0 && <span className="muted">none</span>}
                      {keys.map((k) => (
                        <kbd key={k}>{formatKeys(k)}</kbd>
                      ))}
                      {overrides[c.id] && (
                        <button className="link" onClick={() => reset(c.id)}>
                          Reset
                        </button>
                      )}
                      <button
                        className="btn small"
                        onClick={() => {
                          setNote("");
                          setRecording(c.id);
                        }}
                      >
                        Change
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </Group>
      ))}
      <div className="set-footer">
        <span className="muted">Host list keys apply only while the host list has focus.</span>
        <button
          className="btn"
          disabled={Object.keys(overrides).length === 0}
          onClick={() => {
            onSettings({ ...settings, keybindings: {} });
            setNote("");
          }}
        >
          Reset all
        </button>
      </div>
    </>
  );
}

function AboutSection() {
  return (
    <>
      <div className="about">
        <h2>Tiller</h2>
        <p className="muted">Version 0.1.0</p>
      </div>
      <Group title="Security">
        <Item label="Passwords and passphrases" sub="Stored in the OS credential store (Windows Credential Manager, macOS Keychain).">
          <span />
        </Item>
        <Item label="Server fingerprints" sub="Remembered on first connect; a changed fingerprint blocks the connection.">
          <span />
        </Item>
      </Group>
    </>
  );
}

export function SettingsView({
  dark,
  settings,
  onSettings,
  keys,
  hosts,
  onKeysChange,
  onToast,
}: {
  dark: boolean;
  settings: Settings;
  onSettings: (s: Settings) => void;
  keys: KeyInfo[];
  hosts: Host[];
  onKeysChange: (keys: KeyInfo[]) => void;
  onToast: (msg: string) => void;
}) {
  const [section, setSection] = useState<Section>("appearance");
  const current = SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="settings">
      <nav className="set-nav">
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? "on" : ""} onClick={() => setSection(s.id)}>
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>
      <div className="set-main">
        <div className="set-content">
          <h1>{current.label}</h1>
          {section === "appearance" && (
            <AppearanceSection
              value={settings.appearance.theme}
              onChange={(theme) => onSettings({ ...settings, appearance: { ...settings.appearance, theme } })}
            />
          )}
          {section === "terminal" && (
            <TerminalSection
              value={settings.terminal}
              dark={dark}
              onChange={(terminal) => onSettings({ ...settings, terminal })}
            />
          )}
          {section === "keyboard" && <KeyboardSection settings={settings} onSettings={onSettings} />}
          {section === "keys" && <KeysSection keys={keys} hosts={hosts} onKeysChange={onKeysChange} onToast={onToast} />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
