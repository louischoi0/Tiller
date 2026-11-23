import {
  DragEvent,
  Fragment,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, Collection, Host, KeyInfo, newId, normalizeSettings, Settings, DEFAULT_SETTINGS } from "./api";
import { LayoutNode, leaves, removeLeaf, setRatio, splitLeaf } from "./layout";
import { effectiveColors, resolveTerminalTheme } from "./themes";
import {
  applyTerminalColors,
  applyTerminalSettings,
  attach,
  copySelection,
  createPane,
  disposePane,
  focusPane,
  getHostId,
  getSelection,
  getStatus,
  isMac,
  pasteClipboard,
  subscribe,
} from "./terminals";
import { HostDialog } from "./dialogs";
import { bindingsOf, chordFromEvent, COMMANDS, formatKeys, keyCapture, numpadShiftChord } from "./commands";
import { CommandPalette, PaletteItem } from "./palette";
import { SettingsView } from "./settings";
import "./App.css";

type Tab =
  | { id: string; kind: "ssh"; title: string; root: LayoutNode; activePane: string }
  | { id: string; kind: "settings"; title: string };

type SshTab = Extract<Tab, { kind: "ssh" }>;

// ---- icons ----------------------------------------------------------------

const Icon = {
  plus: (
    <svg viewBox="0 0 16 16">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  ),
  folderPlus: (
    <svg viewBox="0 0 16 16">
      <path d="M1.5 4.5a1 1 0 011-1h3.2l1.5 1.5h6.3a1 1 0 011 1v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1z" />
      <path d="M8 7.5v4M6 9.5h4" />
    </svg>
  ),
  sidebar: (
    <svg viewBox="0 0 16 16">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2.5" />
      <path d="M6 2.5v11" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 16 16">
      <path d="M6 4l4 4-4 4" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 16 16">
      <path d="M1.5 4.5a1 1 0 011-1h3.2l1.5 1.5h6.3a1 1 0 011 1v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1z" />
    </svg>
  ),
  server: (
    <svg viewBox="0 0 16 16">
      <rect x="2" y="2.5" width="12" height="4.5" rx="1.2" />
      <rect x="2" y="9" width="12" height="4.5" rx="1.2" />
      <path d="M4.5 4.75h.01M4.5 11.25h.01" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 16 16">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" className="gear">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  terminal: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <path d="M7.5 10l3 2.5-3 2.5M12.5 15.5h4" />
    </svg>
  ),
};

// ---- small building blocks ------------------------------------------------

type MenuItem = { label: string; onPick: () => void; danger?: boolean } | "separator";

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onClose);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onClose);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);
  const height = items.length * 28;
  return (
    <div
      className="ctx-menu"
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - height - 16) }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it === "separator" ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            className={it.danger ? "danger" : ""}
            onClick={() => {
              onClose();
              it.onPick();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

/** Minimize / maximize / close for the undecorated Windows window (macOS keeps its native buttons). */
function WindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const sync = () =>
      Promise.all([win.isMaximized(), win.isFullscreen()])
        .then(([max, full]) => setMaximized(max || full))
        .catch(() => {});
    sync();
    const un = win.onResized(sync);
    return () => {
      un.then((f) => f());
    };
  }, []);
  return (
    <div className="win-controls">
      <button title="Minimize" onClick={() => win.minimize()}>
        <svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg>
      </button>
      <button title={maximized ? "Restore" : "Maximize"} onClick={() => win.toggleMaximize()}>
        {maximized ? (
          <svg viewBox="0 0 10 10"><path d="M2 0h8v8M0 2h8v8H0z" /></svg>
        ) : (
          <svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z" /></svg>
        )}
      </button>
      <button className="close" title="Close" onClick={() => win.close()}>
        <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>
      </button>
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="rename"
      value={v}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(v.trim() || null);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(v.trim() || null)}
    />
  );
}

// ---- terminal panes -------------------------------------------------------

function PaneView({
  paneId,
  active,
  onFocus,
  onSplit,
  onClose,
}: {
  paneId: string;
  active: boolean;
  onFocus: () => void;
  onSplit: (dir: "row" | "column") => void;
  onClose: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  // hasSelection is read when the menu opens: Copy only appears with something to copy.
  const [menu, setMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);
  useEffect(() => attach(paneId, body.current!), [paneId]);
  return (
    <div
      data-pane={paneId}
      className={`pane ${active ? "active" : ""}`}
      onMouseDownCapture={onFocus}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, hasSelection: getSelection(paneId) !== "" });
      }}
    >
      <div className="pane-body" ref={body} />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(menu.hasSelection ? [{ label: "Copy", onPick: () => copySelection(paneId) }] : []),
            { label: "Paste", onPick: () => pasteClipboard(paneId) },
            "separator",
            { label: "Split right", onPick: () => onSplit("row") },
            { label: "Split down", onPick: () => onSplit("column") },
            "separator",
            { label: "Close pane", onPick: onClose, danger: true },
          ]}
        />
      )}
    </div>
  );
}

function TabDot({ paneId }: { paneId: string }) {
  const status = useSyncExternalStore(subscribe, () => getStatus(paneId));
  return <span className={`dot ${status}`} />;
}

interface LayoutProps {
  node: LayoutNode;
  activePane: string;
  onFocus: (paneId: string) => void;
  onSplit: (paneId: string, dir: "row" | "column") => void;
  onClose: (paneId: string) => void;
  onRatio: (splitId: string, ratio: number) => void;
}

function LayoutView(props: LayoutProps) {
  const { node, activePane, onFocus, onSplit, onClose, onRatio } = props;
  const box = useRef<HTMLDivElement>(null);
  if (node.type === "leaf") {
    return (
      <PaneView
        paneId={node.paneId}
        active={node.paneId === activePane}
        onFocus={() => onFocus(node.paneId)}
        onSplit={(dir) => onSplit(node.paneId, dir)}
        onClose={() => onClose(node.paneId)}
      />
    );
  }
  const startDrag = (e: ReactMouseEvent) => {
    e.preventDefault();
    const rect = box.current!.getBoundingClientRect();
    document.body.classList.add("dragging");
    const move = (ev: MouseEvent) => {
      const r =
        node.dir === "row" ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      onRatio(node.id, Math.min(0.9, Math.max(0.1, r)));
    };
    const up = () => {
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div className={`split ${node.dir}`} ref={box}>
      <div className="split-child" style={{ flex: `${node.ratio} 1 0` }}>
        <LayoutView {...props} node={node.a} />
      </div>
      <div className="divider" onMouseDown={startDrag} />
      <div className="split-child" style={{ flex: `${1 - node.ratio} 1 0` }}>
        <LayoutView {...props} node={node.b} />
      </div>
    </div>
  );
}

// ---- app ------------------------------------------------------------------

type Menu =
  | { kind: "host"; host: Host; x: number; y: number }
  | { kind: "collection"; col: Collection; x: number; y: number }
  | { kind: "blank"; x: number; y: number };

/** One visible row of the host tree, in display order (what j/k walk over). */
type Item = { key: string; col?: Collection; host?: Host };

const ROOT = "__root__";

export default function App() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  /** Selected tree row: "h:<hostId>" or "c:<collectionId>". */
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragHost, setDragHost] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [focusArea, setFocusArea] = useState<"hosts" | "main">("hosts");
  const [editing, setEditing] = useState<{ host?: Host; collectionId?: string | null } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .storeGet()
      .then((s) => {
        setCollections(s.collections);
        setHosts(s.hosts.map((h) => ({ ...h, collectionId: h.collectionId ?? null })));
        setKeys(s.keys);
        const st = normalizeSettings(s.settings);
        setSettings(st);
        applyTerminalSettings(st.terminal);
      })
      .catch((e) => setToast(String(e)));
  }, []);

  useEffect(() => {
    // Another Tiller window (e.g. the dev build beside the installed app) may have changed
    // the hosts. Reload them on focus so this window never saves an outdated list over them.
    const reload = () =>
      api
        .storeGet()
        .then((s) => {
          setCollections(s.collections);
          setHosts(s.hosts.map((h) => ({ ...h, collectionId: h.collectionId ?? null })));
          setKeys(s.keys);
        })
        .catch(() => {});
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  useEffect(() => {
    // The rounded frame is square while maximized.
    const win = getCurrentWindow();
    const sync = () =>
      Promise.all([win.isMaximized(), win.isFullscreen()])
        .then(([max, full]) => setMaximized(max || full))
        .catch(() => {});
    sync();
    const un = win.onResized(sync);
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, []);

  // ---- theme --------------------------------------------------------------

  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const appTheme = settings.appearance.theme;
  const dark = appTheme === "system" ? systemDark : appTheme === "dark";

  useEffect(() => {
    // Native window chrome (macOS traffic lights) follows the app theme.
    getCurrentWindow()
      .setTheme(appTheme === "system" ? null : appTheme)
      .catch(() => {});
  }, [appTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    applyTerminalColors(effectiveColors(resolveTerminalTheme(settings.terminal.theme, dark), dark));
  }, [dark, settings.terminal.theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- mode & focus -------------------------------------------------------

  const current = tabs.find((t) => t.id === activeTab) ?? null;
  const ssh = current?.kind === "ssh" ? current : null;
  const sidebarOpen = settings.appearance.sidebarOpen;
  const area = current ? focusArea : "hosts";
  const activePane = ssh?.activePane ?? null;

  useEffect(() => {
    if (editing || renaming || palette) return;
    if (area === "hosts") {
      treeRef.current?.focus();
    } else if (activePane) {
      focusPane(activePane);
    }
  }, [area, activePane, activeTab, editing, renaming, palette]);

  useEffect(() => {
    if (selected) document.querySelector(`[data-key="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // ---- persistence --------------------------------------------------------

  const saveLibrary = (cols: Collection[], hs: Host[]) => {
    setCollections(cols);
    setHosts(hs);
    return api.librarySave(cols, hs).catch((e) => {
      setToast(String(e));
      throw e;
    });
  };

  const changeSettings = (s: Settings) => {
    setSettings(s);
    applyTerminalSettings(s.terminal);
    api.settingsSave(s).catch((e) => setToast(String(e)));
  };

  const setSidebar = (open: boolean) => {
    changeSettings({ ...settings, appearance: { ...settings.appearance, sidebarOpen: open } });
    if (!open && current) setFocusArea("main");
  };

  // ---- tabs & panes -------------------------------------------------------

  const showTab = (tabId: string) => {
    setActiveTab(tabId);
    setFocusArea("main");
  };

  const openHost = (host: Host) => {
    const paneId = createPane(host);
    const tab: Tab = { id: newId(), kind: "ssh", title: host.name, root: { type: "leaf", paneId }, activePane: paneId };
    setTabs((ts) => [...ts, tab]);
    showTab(tab.id);
  };

  const openSettings = () => {
    const existing = tabs.find((t) => t.kind === "settings");
    if (existing) return showTab(existing.id);
    const tab: Tab = { id: newId(), kind: "settings", title: "Settings" };
    setTabs((ts) => [...ts, tab]);
    showTab(tab.id);
  };

  const updateSsh = (tabId: string, fn: (t: SshTab) => SshTab) =>
    setTabs((ts) => ts.map((t) => (t.id === tabId && t.kind === "ssh" ? fn(t) : t)));

  const dropTab = (tabId: string) => {
    const idx = tabs.findIndex((t) => t.id === tabId);
    const rest = tabs.filter((t) => t.id !== tabId);
    setTabs(rest);
    if (activeTab === tabId) setActiveTab(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
  };

  const splitPane = (tabId: string, paneId: string, dir: "row" | "column") => {
    const host = hosts.find((h) => h.id === getHostId(paneId));
    if (!host) return setToast("This host was deleted, so a new pane can't be opened.");
    const fresh = createPane(host);
    const splitId = newId();
    updateSsh(tabId, (t) => ({ ...t, root: splitLeaf(t.root, paneId, fresh, dir, splitId), activePane: fresh }));
    setFocusArea("main");
  };

  const closePane = (tabId: string, paneId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "ssh") return;
    disposePane(paneId);
    const root = removeLeaf(tab.root, paneId);
    if (!root) return dropTab(tabId);
    updateSsh(tabId, (t) => ({
      ...t,
      root,
      activePane: t.activePane === paneId ? leaves(root)[0] : t.activePane,
    }));
  };

  const closeTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.kind === "ssh") leaves(tab.root).forEach(disposePane);
    dropTab(tabId);
  };

  /** Moves focus to the nearest pane in a direction; past the left edge it lands on the host list. */
  const focusDir = (dir: "h" | "j" | "k" | "l") => {
    if (area === "hosts") {
      if (dir === "l" && current) setFocusArea("main");
      return;
    }
    if (!ssh) {
      if (dir === "h" && sidebarOpen) setFocusArea("hosts");
      return;
    }
    const els = [...document.querySelectorAll<HTMLElement>(".tab-body[data-active] [data-pane]")];
    const cur = els.find((el) => el.dataset.pane === ssh.activePane);
    if (!cur) return;
    const a = cur.getBoundingClientRect();
    let best: { id: string; d: number } | null = null;
    for (const el of els) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const ok =
        dir === "h" ? b.right <= a.left + 2
        : dir === "l" ? b.left >= a.right - 2
        : dir === "k" ? b.bottom <= a.top + 2
        : b.top >= a.bottom - 2;
      if (!ok) continue;
      const d = Math.hypot(b.left + b.width / 2 - (a.left + a.width / 2), b.top + b.height / 2 - (a.top + a.height / 2));
      if (!best || d < best.d) best = { id: el.dataset.pane!, d };
    }
    if (best) {
      const id = best.id;
      updateSsh(ssh.id, (t) => ({ ...t, activePane: id }));
    } else if (dir === "h" && sidebarOpen) {
      setFocusArea("hosts");
    }
  };

  // ---- library ------------------------------------------------------------

  const saveHost = async (h: Host) => {
    const next = hosts.some((x) => x.id === h.id) ? hosts.map((x) => (x.id === h.id ? h : x)) : [...hosts, h];
    // Reveal the collection the host landed in.
    const cols = collections.map((c) => (c.id === h.collectionId ? { ...c, collapsed: false } : c));
    await saveLibrary(cols, next);
    setSelected("h:" + h.id);
  };

  const deleteHost = async (h: Host) => {
    if (!confirm(`Delete host '${h.name}'?`)) return;
    try {
      await saveLibrary(collections, hosts.filter((x) => x.id !== h.id));
      await api.hostSetPassword(h.id, null);
      await api.hostForgetKey(h.id);
    } catch {
      /* toast already shown */
    }
  };

  const addCollection = () => {
    if (!sidebarOpen) setSidebar(true);
    const col: Collection = { id: newId(), name: "New collection", collapsed: false };
    saveLibrary([...collections, col], hosts).catch(() => {});
    setSelected("c:" + col.id);
    setRenaming(col.id);
  };

  const renameCollection = (id: string, name: string | null) => {
    setRenaming(null);
    if (!name) return;
    saveLibrary(
      collections.map((c) => (c.id === id ? { ...c, name } : c)),
      hosts,
    ).catch(() => {});
  };

  const setCollapsed = (id: string, collapsed: boolean) =>
    saveLibrary(
      collections.map((c) => (c.id === id ? { ...c, collapsed } : c)),
      hosts,
    ).catch(() => {});

  const deleteCollection = (col: Collection) => {
    const inside = hosts.filter((h) => h.collectionId === col.id).length;
    const msg = inside
      ? `Delete collection '${col.name}'?\nIts ${inside} host(s) will move to the top level.`
      : `Delete collection '${col.name}'?`;
    if (!confirm(msg)) return;
    saveLibrary(
      collections.filter((c) => c.id !== col.id),
      hosts.map((h) => (h.collectionId === col.id ? { ...h, collectionId: null } : h)),
    ).catch(() => {});
  };

  const moveHost = (hostId: string, collectionId: string | null) => {
    const h = hosts.find((x) => x.id === hostId);
    if (!h || h.collectionId === collectionId) return;
    saveLibrary(
      collections.map((c) => (c.id === collectionId ? { ...c, collapsed: false } : c)),
      hosts.map((x) => (x.id === hostId ? { ...x, collectionId } : x)),
    ).catch(() => {});
  };

  // ---- visible rows -------------------------------------------------------

  const known = new Set(collections.map((c) => c.id));
  const rootHosts = hosts.filter((h) => !h.collectionId || !known.has(h.collectionId));

  const visible: Item[] = [];
  for (const c of collections) {
    visible.push({ key: "c:" + c.id, col: c });
    if (!c.collapsed) for (const h of hosts) if (h.collectionId === c.id) visible.push({ key: "h:" + h.id, host: h });
  }
  for (const h of rootHosts) visible.push({ key: "h:" + h.id, host: h });

  // ---- commands & keyboard (see DESIGN.md, commands.ts) -------------------

  const selIdx = visible.findIndex((i) => i.key === selected);
  const sel = selIdx >= 0 ? visible[selIdx] : null;
  const go = (i: number) => {
    const it = visible[Math.max(0, Math.min(visible.length - 1, i))];
    if (it) setSelected(it.key);
  };
  const cycleTab = (step: number) => {
    if (!tabs.length) return;
    const i = tabs.findIndex((t) => t.id === activeTab);
    showTab(tabs[(i + step + tabs.length) % tabs.length].id);
  };

  /** What each command does right now. Ids match COMMANDS in commands.ts. */
  const run: Record<string, () => void> = {
    "palette.open": () => setPalette(true),
    "settings.open": openSettings,
    "window.fullscreen": () => {
      const win = getCurrentWindow();
      win.isFullscreen().then((full) => win.setFullscreen(!full)).catch(() => {});
    },
    "sidebar.toggle": () => setSidebar(!sidebarOpen),
    "hosts.focus": () => {
      if (!sidebarOpen) setSidebar(true);
      setFocusArea("hosts");
    },
    "pane.splitRight": () => ssh && splitPane(ssh.id, ssh.activePane, "row"),
    "pane.splitDown": () => ssh && splitPane(ssh.id, ssh.activePane, "column"),
    "pane.close": () => current && (ssh ? closePane(ssh.id, ssh.activePane) : closeTab(current.id)),
    "pane.focusLeft": () => focusDir("h"),
    "pane.focusDown": () => focusDir("j"),
    "pane.focusUp": () => focusDir("k"),
    "pane.focusRight": () => focusDir("l"),
    "tab.prev": () => cycleTab(-1),
    "tab.next": () => cycleTab(1),
    "list.down": () => go(selIdx + 1),
    "list.up": () => go(selIdx < 0 ? 0 : selIdx - 1),
    "list.top": () => go(0),
    "list.bottom": () => go(visible.length - 1),
    "list.open": () => {
      if (sel?.host) openHost(sel.host);
      else if (sel?.col) setCollapsed(sel.col.id, !sel.col.collapsed);
    },
    "list.expand": () => {
      if (sel?.host) openHost(sel.host);
      else if (sel?.col) setCollapsed(sel.col.id, false);
    },
    "list.collapse": () => {
      if (sel?.col) setCollapsed(sel.col.id, true);
      else if (sel?.host?.collectionId && known.has(sel.host.collectionId)) setSelected("c:" + sel.host.collectionId);
    },
    "host.new": () => setEditing({ collectionId: sel?.col?.id ?? sel?.host?.collectionId ?? null }),
    "collection.new": addCollection,
    "list.edit": () => {
      if (sel?.host) setEditing({ host: sel.host });
      else if (sel?.col) setRenaming(sel.col.id);
    },
    "list.delete": () => {
      if (sel?.host) deleteHost(sel.host);
      else if (sel?.col) deleteCollection(sel.col);
    },
    "list.back": () => current && setFocusArea("main"),
  };
  for (let i = 0; i <= 9; i++) run[`tab.${i}`] = () => tabs[i] && showTab(tabs[i].id);

  const overrides = settings.keybindings;
  /** Display label of a command's first key binding. */
  const kl = (id: string) => formatKeys(bindingsOf(id, overrides)[0] ?? "");

  // Commands for the palette: everything except list navigation, plus one entry per host.
  const paletteItems: PaletteItem[] = [
    ...COMMANDS.filter((c) => c.id !== "palette.open" && (!c.id.startsWith("list.") || c.id === "list.edit" || c.id === "list.delete")).map(
      (c) => ({ id: c.id, title: c.title, hint: kl(c.id), run: () => run[c.id]?.() }),
    ),
    ...hosts.map((h) => ({ id: "connect:" + h.id, title: `Connect: ${h.name}`, hint: h.address, run: () => openHost(h) })),
  ];

  const pendingKeys = useRef("");
  const pendingTimer = useRef(0);
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (keyCapture.active || palette || editing || menu) return;
    const chord = chordFromEvent(e);
    if (!chord) return;
    const target = e.target as HTMLElement;
    const inTerminal = !!target.closest?.(".term-host");
    const typing = !inTerminal && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    // Host-list keys are plain letters, so they only apply while the list has focus.
    const hostsOk = !inTerminal && !typing && area === "hosts" && sidebarOpen;
    const allowed = COMMANDS.filter((c) => c.scope === "global" || hostsOk);

    const match = (keys: string): string | "prefix" | null => {
      for (const c of allowed) if (bindingsOf(c.id, overrides).includes(keys)) return c.id;
      for (const c of allowed) if (bindingsOf(c.id, overrides).some((k) => k.startsWith(keys + " "))) return "prefix";
      return null;
    };
    // A chord may continue a pending sequence ("d" then "d"); otherwise it starts fresh.
    let keys = pendingKeys.current ? pendingKeys.current + " " + chord : chord;
    let hit = match(keys);
    if (!hit && pendingKeys.current) {
      keys = chord;
      hit = match(keys);
    }
    if (!hit) {
      const shifted = numpadShiftChord(e);
      if (shifted) hit = match((keys = shifted));
    }
    clearTimeout(pendingTimer.current);
    pendingKeys.current = "";
    if (!hit) return; // not ours: the key goes to the terminal or the focused field
    e.preventDefault();
    e.stopPropagation();
    if (hit === "prefix") {
      pendingKeys.current = keys;
      pendingTimer.current = window.setTimeout(() => (pendingKeys.current = ""), 800);
    } else {
      run[hit]?.();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  // ---- drag & drop --------------------------------------------------------

  const dropProps = (target: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragHost) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== target) setDropTarget(target);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragHost) moveHost(dragHost, target === ROOT ? null : target);
      setDragHost(null);
      setDropTarget(null);
    },
  });

  // ---- render -------------------------------------------------------------

  const hostRow = (h: Host, nested: boolean) => (
    <li
      key={h.id}
      data-key={"h:" + h.id}
      className={`row host ${nested ? "nested" : ""} ${selected === "h:" + h.id ? "selected" : ""} ${dragHost === h.id ? "dragging" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", h.id);
        setDragHost(h.id);
      }}
      onDragEnd={() => {
        setDragHost(null);
        setDropTarget(null);
      }}
      onClick={() => setSelected("h:" + h.id)}
      onDoubleClick={() => openHost(h)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSelected("h:" + h.id);
        setMenu({ kind: "host", host: h, x: e.clientX, y: e.clientY });
      }}
    >
      <span className="row-icon">{Icon.server}</span>
      <span className="row-name">{h.name}</span>
      <span className="row-meta">{h.address}</span>
    </li>
  );

  return (
    <div className={`app ${isMac ? "mac" : "win"} ${maximized ? "maximized" : ""} ${sidebarOpen ? "" : "no-side"}`}>
      <div className="topbar">
        <div className="side-tools" data-tauri-drag-region>
          <button
            className="titlebar-btn"
            title={`${sidebarOpen ? "Hide" : "Show"} sidebar (${kl("sidebar.toggle")})`}
            onClick={() => setSidebar(!sidebarOpen)}
          >
            {Icon.sidebar}
          </button>
        </div>
      <div className="tabs" data-tauri-drag-region>
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab ${t.kind} ${t.id === activeTab ? "on" : ""}`}
            onClick={() => showTab(t.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
          >
            {t.kind === "ssh" ? <TabDot paneId={t.activePane} /> : <span className="tab-icon">{Icon.gear}</span>}
            <span className="tab-title">{t.title}</span>
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
            >
              {Icon.close}
            </button>
          </div>
        ))}
        <div className="drag-fill" data-tauri-drag-region />
        <button
          className={`titlebar-btn ${current?.kind === "settings" ? "on" : ""}`}
          title={`Settings (${kl("settings.open")})`}
          onClick={openSettings}
        >
          {Icon.gear}
        </button>
        {!isMac && <WindowControls />}
      </div>
      </div>
      <div className="body">
        <aside className="sidebar" onMouseDown={() => setFocusArea("hosts")}>
          <div className="side-label">
            <span>Hosts</span>
            <span className="side-actions">
              <button className="icon-btn" title={`New host (${kl("host.new")})`} onClick={() => setEditing({})}>
                {Icon.plus}
              </button>
              <button className="icon-btn" title={`New collection (${kl("collection.new")})`} onClick={addCollection}>
                {Icon.folderPlus}
              </button>
            </span>
          </div>

          <div
            ref={treeRef}
            tabIndex={-1}
            className={`tree ${area === "hosts" ? "focused" : ""} ${dropTarget === ROOT ? "drop" : ""}`}
            {...dropProps(ROOT)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ kind: "blank", x: e.clientX, y: e.clientY });
            }}
          >
            {collections.map((c) => {
              const children = hosts.filter((h) => h.collectionId === c.id);
              const open = !c.collapsed;
              return (
                <ul key={c.id} className={`group ${dropTarget === c.id ? "drop" : ""}`} {...dropProps(c.id)}>
                  <li
                    data-key={"c:" + c.id}
                    className={`row collection ${selected === "c:" + c.id ? "selected" : ""}`}
                    onClick={() => {
                      if (renaming === c.id) return;
                      setSelected("c:" + c.id);
                      setCollapsed(c.id, !c.collapsed);
                    }}
                    onDoubleClick={() => setRenaming(c.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected("c:" + c.id);
                      setMenu({ kind: "collection", col: c, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <span className={`chevron ${open ? "open" : ""}`}>{Icon.chevron}</span>
                    {renaming === c.id ? (
                      <RenameInput initial={c.name} onDone={(n) => renameCollection(c.id, n)} />
                    ) : (
                      <span className="row-name">{c.name}</span>
                    )}
                    <span className="row-count">{children.length}</span>
                  </li>
                  {open && children.map((h) => hostRow(h, true))}
                </ul>
              );
            })}
            <ul className="group">{rootHosts.map((h) => hostRow(h, false))}</ul>

            {hosts.length === 0 && collections.length === 0 && (
              <div className="side-empty">
                <p>No hosts yet.</p>
                <button className="btn primary" onClick={() => setEditing({})}>
                  Add host
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="main">
          <div className="workspace" onMouseDownCapture={() => current && setFocusArea("main")}>
            {tabs.length === 0 && (
              <div className="welcome">
                <h1>Tiller</h1>
                <p>keyboard-first ssh client</p>
                <div className="keys">
                  {(
                    [
                      ["move", ["list.down", "list.up"]],
                      ["connect", ["list.open"]],
                      ["new host", ["host.new"]],
                      ["split pane", ["pane.splitRight", "pane.splitDown"]],
                      ["focus pane", ["pane.focusLeft", "pane.focusDown", "pane.focusUp", "pane.focusRight"]],
                      ["toggle sidebar", ["sidebar.toggle"]],
                      ["command palette", ["palette.open"]],
                      ["settings", ["settings.open"]],
                      ["full screen", ["window.fullscreen"]],
                    ] as const
                  ).map(([label, ids]) => (
                    <Fragment key={label}>
                      <span>
                        {ids.map((id) => kl(id) && <kbd key={id}>{kl(id)}</kbd>)}
                      </span>
                      <span>{label}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
            {tabs.map((t) => (
              <div
                key={t.id}
                className="tab-body"
                data-active={t.id === activeTab ? "" : undefined}
                style={{ display: t.id === activeTab ? "flex" : "none" }}
              >
                {t.kind === "ssh" ? (
                  <LayoutView
                    node={t.root}
                    activePane={t.activePane}
                    onFocus={(paneId) =>
                      t.activePane !== paneId && updateSsh(t.id, (x) => ({ ...x, activePane: paneId }))
                    }
                    onSplit={(paneId, dir) => splitPane(t.id, paneId, dir)}
                    onClose={(paneId) => closePane(t.id, paneId)}
                    onRatio={(splitId, ratio) =>
                      updateSsh(t.id, (x) => ({ ...x, root: setRatio(x.root, splitId, ratio) }))
                    }
                  />
                ) : (
                  <SettingsView
                    dark={dark}
                    settings={settings}
                    onSettings={changeSettings}
                    keys={keys}
                    hosts={hosts}
                    onKeysChange={setKeys}
                    onToast={setToast}
                  />
                )}
              </div>
            ))}
          </div>
        </main>
      </div>

      {menu?.kind === "host" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Connect", onPick: () => openHost(menu.host) },
            { label: "Edit…", onPick: () => setEditing({ host: menu.host }) },
            ...(menu.host.collectionId
              ? [{ label: "Remove from collection", onPick: () => moveHost(menu.host.id, null) } as MenuItem]
              : []),
            "separator",
            { label: "Delete", onPick: () => deleteHost(menu.host), danger: true },
          ]}
        />
      )}
      {menu?.kind === "collection" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Add host to this collection…", onPick: () => setEditing({ collectionId: menu.col.id }) },
            { label: "Rename", onPick: () => setRenaming(menu.col.id) },
            "separator",
            { label: "Delete collection", onPick: () => deleteCollection(menu.col), danger: true },
          ]}
        />
      )}
      {menu?.kind === "blank" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "New host…", onPick: () => setEditing({}) },
            { label: "New collection", onPick: addCollection },
          ]}
        />
      )}
      {editing && (
        <HostDialog
          host={editing.host}
          defaultCollection={editing.collectionId}
          collections={collections}
          keys={keys}
          onKeyAdded={(k) => setKeys((ks) => [...ks, k])}
          onSave={saveHost}
          onClose={() => setEditing(null)}
        />
      )}
      {palette && <CommandPalette items={paletteItems} onClose={() => setPalette(false)} />}
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
