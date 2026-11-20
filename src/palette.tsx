import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteItem {
  id: string;
  title: string;
  /** Right-aligned detail: a key binding or a host address. */
  hint?: string;
  run: () => void;
}

/** Every word of the query must appear in the title; titles that start with the query rank first. */
function filter(items: PaletteItem[], query: string): PaletteItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const q = query.trim().toLowerCase();
  return items
    .filter((it) => {
      const t = it.title.toLowerCase();
      return words.every((w) => t.includes(w));
    })
    .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)));
}

export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filter(items, query), [items, query]);
  const active = Math.min(index, Math.max(0, shown.length - 1));

  useEffect(() => {
    list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [active, shown]);

  const run = (it: PaletteItem | undefined) => {
    if (!it) return;
    onClose();
    it.run();
  };

  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette">
        <input
          autoFocus
          value={query}
          spellCheck={false}
          placeholder="Type a command or host name"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "Enter") run(shown[active]);
            else if (e.key === "ArrowDown") setIndex((active + 1) % Math.max(1, shown.length));
            else if (e.key === "ArrowUp") setIndex((active - 1 + shown.length) % Math.max(1, shown.length));
            else if (e.key === "Tab") {
              // Autocomplete: fill in the highlighted entry's full name.
              if (shown[active]) {
                setQuery(shown[active].title);
                setIndex(0);
              }
            } else return;
            e.preventDefault();
          }}
        />
        <div className="palette-list" ref={list}>
          {shown.map((it, i) => (
            <button
              key={it.id}
              className={i === active ? "on" : ""}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(it)}
            >
              <span>{it.title}</span>
              {it.hint && <kbd>{it.hint}</kbd>}
            </button>
          ))}
          {shown.length === 0 && <p>No matching commands</p>}
        </div>
      </div>
    </div>
  );
}
