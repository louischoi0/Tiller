// Keyword highlighting for terminal output.
//
// Matches are colored with xterm decorations, which sit on top of the buffer:
// the data stream and the remote program's own colors are never modified.
// Full-screen programs (vim, htop, less) use the alternate buffer and are left alone.
import type { IDecoration, IDisposable, IMarker, Terminal } from "@xterm/xterm";
import type { HighlightSettings } from "./api";

type Category = keyof HighlightSettings["colors"];

const RULES: { key: Category; re: RegExp }[] = [
  { key: "error", re: /\b(?:errors?|err|fail(?:ed|ure|ures|s)?|fatal|critical|denied|refused|exception|panic)\b/gi },
  { key: "warning", re: /\b(?:warn(?:ing|ings)?|deprecated|caution)\b/gi },
  { key: "ok", re: /\b(?:ok|okay|success(?:ful|fully)?|succeeded|passed|done|enabled|active|running)\b/gi },
  { key: "info", re: /\b(?:info|information|notice)\b/gi },
  { key: "debug", re: /\b(?:debug|trace|verbose)\b/gi },
  // IPv4 (optional :port or /prefix) and MAC addresses
  { key: "address", re: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5}|\/\d{1,2})?\b|\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi },
];

/** Lines scanned at most in one pass; a huge burst of output only gets its tail highlighted. */
const MAX_SCAN = 2000;

export class Highlighter {
  /** Highlighted lines in buffer order: one marker per line and its decorations. */
  private marks: { marker: IMarker; decos: IDecoration[] }[] = [];
  /** Marks the last line already scanned. */
  private tail: IMarker | null = null;
  private timer = 0;
  private sub: IDisposable;

  constructor(
    private term: Terminal,
    private cfg: HighlightSettings,
  ) {
    this.sub = term.onWriteParsed(() => this.schedule());
  }

  setConfig(cfg: HighlightSettings) {
    this.cfg = cfg;
    this.clear();
    this.tail?.dispose();
    this.tail = null;
    this.schedule();
  }

  dispose() {
    clearTimeout(this.timer);
    this.sub.dispose();
    this.clear();
    this.tail?.dispose();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.scan();
    }, 60);
  }

  /** Removes highlights on buffer lines >= from. */
  private clear(from = 0) {
    while (this.marks.length) {
      const m = this.marks[this.marks.length - 1];
      if (!m.marker.isDisposed && m.marker.line < from) break;
      m.decos.forEach((d) => d.dispose());
      m.marker.dispose();
      this.marks.pop();
    }
    // Markers of lines that scrolled out of the scrollback dispose themselves; drop them now and then.
    if (this.marks.length > 4000) this.marks = this.marks.filter((m) => !m.marker.isDisposed);
  }

  private scan() {
    const t = this.term;
    const buf = t.buffer.active;
    if (!this.cfg.enabled || buf.type !== "normal") {
      this.clear();
      this.tail?.dispose();
      this.tail = null;
      return;
    }
    const cur = buf.baseY + buf.cursorY;
    // Resume at the last scanned line (it may have been appended to); first pass covers the screen.
    const resume = this.tail && !this.tail.isDisposed && this.tail.line >= 0 ? this.tail.line : cur - t.rows;
    const from = Math.max(0, resume, cur - MAX_SCAN);
    this.clear(from);

    for (let y = from; y <= cur; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      // Text of the line plus, for each character, the cell column it sits in
      // (wide characters such as Hangul take two cells but one character).
      let text = "";
      const col: number[] = [];
      for (let x = 0; x < line.length; x++) {
        const cell = line.getCell(x);
        if (!cell) break;
        if (cell.getWidth() === 0) continue;
        const ch = cell.getChars() || " ";
        for (let i = 0; i < ch.length; i++) col.push(x);
        text += ch;
      }
      if (!text.trim()) continue;

      const hits: { start: number; end: number; color: string }[] = [];
      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        for (let m = rule.re.exec(text); m; m = rule.re.exec(text)) {
          hits.push({ start: m.index, end: m.index + m[0].length, color: this.cfg.colors[rule.key] });
        }
      }
      if (!hits.length) continue;

      const marker = t.registerMarker(y - cur);
      if (!marker) continue;
      const decos: IDecoration[] = [];
      for (const h of hits) {
        const x = col[h.start];
        const lastCell = col[h.end - 1];
        const width = lastCell + (line.getCell(lastCell)?.getWidth() || 1) - x;
        const d = t.registerDecoration({ marker, x, width, foregroundColor: h.color, layer: "top" });
        if (d) decos.push(d);
      }
      this.marks.push({ marker, decos });
    }

    this.tail?.dispose();
    this.tail = t.registerMarker(0) ?? null;
  }
}
