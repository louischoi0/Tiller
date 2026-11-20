import type { ITheme } from "@xterm/xterm";

export interface TermTheme {
  id: string;
  name: string;
  dark: boolean;
  colors: Required<
    Pick<
      ITheme,
      | "background"
      | "foreground"
      | "cursor"
      | "cursorAccent"
      | "selectionBackground"
      | "black"
      | "red"
      | "green"
      | "yellow"
      | "blue"
      | "magenta"
      | "cyan"
      | "white"
      | "brightBlack"
      | "brightRed"
      | "brightGreen"
      | "brightYellow"
      | "brightBlue"
      | "brightMagenta"
      | "brightCyan"
      | "brightWhite"
    >
  >;
}

/** "auto" follows the app theme (default dark / default light). */
export const AUTO_THEME = "auto";

export const TERMINAL_THEMES: TermTheme[] = [
  {
    id: "default-dark",
    name: "Default Dark",
    dark: true,
    colors: {
      background: "#0e0f11", foreground: "#e4e5e9", cursor: "#4c9aff", cursorAccent: "#0e0f11",
      selectionBackground: "rgba(10, 132, 255, 0.35)",
      black: "#3a3a3c", red: "#ff453a", green: "#32d74b", yellow: "#ffd60a",
      blue: "#0a84ff", magenta: "#bf5af2", cyan: "#64d2ff", white: "#d1d1d6",
      brightBlack: "#636366", brightRed: "#ff6961", brightGreen: "#5be37a", brightYellow: "#ffe55c",
      brightBlue: "#409cff", brightMagenta: "#da8fff", brightCyan: "#8ae0ff", brightWhite: "#ffffff",
    },
  },
  {
    id: "default-light",
    name: "Default Light",
    dark: false,
    colors: {
      background: "#ffffff", foreground: "#1d1d1f", cursor: "#007aff", cursorAccent: "#ffffff",
      selectionBackground: "rgba(0, 122, 255, 0.22)",
      black: "#1d1d1f", red: "#d70015", green: "#248a3d", yellow: "#a05a00",
      blue: "#0040dd", magenta: "#8944ab", cyan: "#0071a4", white: "#8e8e93",
      brightBlack: "#636366", brightRed: "#ff3b30", brightGreen: "#28a745", brightYellow: "#c93400",
      brightBlue: "#007aff", brightMagenta: "#af52de", brightCyan: "#1f9ed1", brightWhite: "#aeaeb2",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    dark: true,
    colors: {
      background: "#002b36", foreground: "#839496", cursor: "#93a1a1", cursorAccent: "#002b36",
      selectionBackground: "#073642",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83",
      brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    dark: false,
    colors: {
      background: "#fdf6e3", foreground: "#657b83", cursor: "#586e75", cursorAccent: "#fdf6e3",
      selectionBackground: "#eee8d5",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83",
      brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    dark: true,
    colors: {
      background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", cursorAccent: "#282a36",
      selectionBackground: "#44475a",
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5",
      brightBlue: "#d6acff", brightMagenta: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#ffffff",
    },
  },
  {
    id: "nord",
    name: "Nord",
    dark: true,
    colors: {
      background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", cursorAccent: "#2e3440",
      selectionBackground: "#434c5e",
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4",
    },
  },
  {
    id: "one-dark",
    name: "One Dark",
    dark: true,
    colors: {
      background: "#282c34", foreground: "#abb2bf", cursor: "#528bff", cursorAccent: "#282c34",
      selectionBackground: "#3e4451",
      black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
      brightBlack: "#5c6370", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b",
      brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#ffffff",
    },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    dark: true,
    colors: {
      background: "#191724", foreground: "#e0def4", cursor: "#ebbcba", cursorAccent: "#191724",
      selectionBackground: "#403d52",
      black: "#26233a", red: "#eb6f92", green: "#31748f", yellow: "#f6c177",
      blue: "#9ccfd8", magenta: "#c4a7e7", cyan: "#ebbcba", white: "#e0def4",
      brightBlack: "#6e6a86", brightRed: "#eb6f92", brightGreen: "#31748f", brightYellow: "#f6c177",
      brightBlue: "#9ccfd8", brightMagenta: "#c4a7e7", brightCyan: "#ebbcba", brightWhite: "#e0def4",
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    dark: false,
    colors: {
      background: "#ffffff", foreground: "#24292f", cursor: "#0969da", cursorAccent: "#ffffff",
      selectionBackground: "rgba(84, 174, 255, 0.4)",
      black: "#24292f", red: "#cf222e", green: "#116329", yellow: "#4d2d00",
      blue: "#0969da", magenta: "#8250df", cyan: "#1b7c83", white: "#6e7781",
      brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#1a7f37", brightYellow: "#633c01",
      brightBlue: "#218bff", brightMagenta: "#a475f9", brightCyan: "#3192aa", brightWhite: "#8c959f",
    },
  },
  // ---- from the public iTerm2-Color-Schemes collection (github.com/mbadolato/iTerm2-Color-Schemes) ----
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    dark: true,
    colors: {
      background: "#1a1b26", foreground: "#c0caf5", cursor: "#c0caf5", cursorAccent: "#1a1b26",
      selectionBackground: "#33467c",
      black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
      blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
      brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a", brightYellow: "#e0af68",
      brightBlue: "#7aa2f7", brightMagenta: "#bb9af7", brightCyan: "#7dcfff", brightWhite: "#c0caf5",
    },
  },
  {
    id: "tokyo-day",
    name: "Tokyo Day",
    dark: false,
    colors: {
      background: "#e1e2e7", foreground: "#3760bf", cursor: "#3760bf", cursorAccent: "#e1e2e7",
      selectionBackground: "#99a7df",
      black: "#e9e9ed", red: "#f52a65", green: "#587539", yellow: "#8c6c3e",
      blue: "#2e7de9", magenta: "#9854f1", cyan: "#007197", white: "#6172b0",
      brightBlack: "#a1a6c5", brightRed: "#f52a65", brightGreen: "#587539", brightYellow: "#8c6c3e",
      brightBlue: "#2e7de9", brightMagenta: "#9854f1", brightCyan: "#007197", brightWhite: "#3760bf",
    },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    dark: true,
    colors: {
      background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#f5e0dc", cursorAccent: "#1e1e2e",
      selectionBackground: "#f5e0dc",
      black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
      blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", white: "#bac2de",
      brightBlack: "#585b70", brightRed: "#f7aec2", brightGreen: "#c2ecbf", brightYellow: "#fcd682",
      brightBlue: "#aeccfc", brightMagenta: "#f398da", brightCyan: "#b1eae1", brightWhite: "#a6adc8",
    },
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    dark: false,
    colors: {
      background: "#eff1f5", foreground: "#4c4f69", cursor: "#dc8a78", cursorAccent: "#eff1f5",
      selectionBackground: "#dc8a78",
      black: "#bcc0cc", red: "#d20f39", green: "#40a02b", yellow: "#df8e1d",
      blue: "#1e66f5", magenta: "#ea76cb", cyan: "#179299", white: "#5c5f77",
      brightBlack: "#acb0be", brightRed: "#e7103f", brightGreen: "#46b02f", brightYellow: "#e49931",
      brightBlue: "#3878f6", brightMagenta: "#ef95d7", brightCyan: "#19a1a8", brightWhite: "#6c6f85",
    },
  },
  {
    id: "atom-one-dark",
    name: "Atom One Dark",
    dark: true,
    colors: {
      background: "#21252b", foreground: "#abb2bf", cursor: "#abb2bf", cursorAccent: "#21252b",
      selectionBackground: "#323844",
      black: "#21252b", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
      brightBlack: "#767676", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b",
      brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#abb2bf",
    },
  },
  {
    id: "atom-one-light",
    name: "Atom One Light",
    dark: false,
    colors: {
      background: "#f9f9f9", foreground: "#2a2c33", cursor: "#bbbbbb", cursorAccent: "#f9f9f9",
      selectionBackground: "#d0dffc",
      black: "#000000", red: "#de3e35", green: "#3f953a", yellow: "#d2b67c",
      blue: "#2f5af3", magenta: "#950095", cyan: "#3f953a", white: "#bbbbbb",
      brightBlack: "#000000", brightRed: "#de3e35", brightGreen: "#3f953a", brightYellow: "#d2b67c",
      brightBlue: "#2f5af3", brightMagenta: "#a00095", brightCyan: "#3f953a", brightWhite: "#ffffff",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    dark: true,
    colors: {
      background: "#282828", foreground: "#ebdbb2", cursor: "#ebdbb2", cursorAccent: "#282828",
      selectionBackground: "#665c54",
      black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921",
      blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984",
      brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26", brightYellow: "#fabd2f",
      brightBlue: "#83a598", brightMagenta: "#d3869b", brightCyan: "#8ec07c", brightWhite: "#ebdbb2",
    },
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    dark: false,
    colors: {
      background: "#fbf1c7", foreground: "#3c3836", cursor: "#3c3836", cursorAccent: "#fbf1c7",
      selectionBackground: "#3c3836",
      black: "#fbf1c7", red: "#cc241d", green: "#98971a", yellow: "#d79921",
      blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#7c6f64",
      brightBlack: "#928374", brightRed: "#9d0006", brightGreen: "#79740e", brightYellow: "#b57614",
      brightBlue: "#076678", brightMagenta: "#8f3f71", brightCyan: "#427b58", brightWhite: "#3c3836",
    },
  },
  {
    id: "material-dark",
    name: "Material Dark",
    dark: true,
    colors: {
      background: "#232322", foreground: "#e5e5e5", cursor: "#16afca", cursorAccent: "#232322",
      selectionBackground: "#dfdfdf",
      black: "#212121", red: "#b7141f", green: "#457b24", yellow: "#f6981e",
      blue: "#134eb2", magenta: "#701aa2", cyan: "#0e717c", white: "#efefef",
      brightBlack: "#4f4f4f", brightRed: "#e83b3f", brightGreen: "#7aba3a", brightYellow: "#ffea2e",
      brightBlue: "#54a4f3", brightMagenta: "#aa4dbc", brightCyan: "#26bbd1", brightWhite: "#d9d9d9",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    dark: true,
    colors: {
      background: "#272822", foreground: "#fdfff1", cursor: "#c0c1b5", cursorAccent: "#272822",
      selectionBackground: "#57584f",
      black: "#272822", red: "#f92672", green: "#a6e22e", yellow: "#e6db74",
      blue: "#fd971f", magenta: "#ae81ff", cyan: "#66d9ef", white: "#fdfff1",
      brightBlack: "#6e7066", brightRed: "#f92672", brightGreen: "#a6e22e", brightYellow: "#e6db74",
      brightBlue: "#fd971f", brightMagenta: "#ae81ff", brightCyan: "#66d9ef", brightWhite: "#fdfff1",
    },
  },
  {
    id: "nord-light",
    name: "Nord Light",
    dark: false,
    colors: {
      background: "#e5e9f0", foreground: "#414858", cursor: "#7bb3c3", cursorAccent: "#e5e9f0",
      selectionBackground: "#d8dee9",
      black: "#3b4252", red: "#bf616a", green: "#96b17f", yellow: "#c5a565",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#7bb3c3", white: "#a5abb6",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#96b17f", brightYellow: "#c5a565",
      brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#82afae", brightWhite: "#eceff4",
    },
  },
  {
    id: "homebrew",
    name: "Homebrew",
    dark: true,
    colors: {
      background: "#000000", foreground: "#00ff00", cursor: "#23ff18", cursorAccent: "#000000",
      selectionBackground: "#083905",
      black: "#000000", red: "#990000", green: "#00a600", yellow: "#999900",
      blue: "#0d0dbf", magenta: "#b200b2", cyan: "#00a6b2", white: "#bfbfbf",
      brightBlack: "#666666", brightRed: "#e50000", brightGreen: "#00d900", brightYellow: "#e5e500",
      brightBlue: "#0000ff", brightMagenta: "#e500e5", brightCyan: "#00e5e5", brightWhite: "#e5e5e5",
    },
  },
  {
    id: "pro",
    name: "Pro",
    dark: true,
    colors: {
      background: "#000000", foreground: "#f2f2f2", cursor: "#4d4d4d", cursorAccent: "#000000",
      selectionBackground: "#414141",
      black: "#000000", red: "#990000", green: "#00a600", yellow: "#999900",
      blue: "#2009db", magenta: "#b200b2", cyan: "#00a6b2", white: "#bfbfbf",
      brightBlack: "#666666", brightRed: "#e50000", brightGreen: "#00d900", brightYellow: "#e5e500",
      brightBlue: "#0000ff", brightMagenta: "#e500e5", brightCyan: "#00e5e5", brightWhite: "#e5e5e5",
    },
  },
  {
    id: "grass",
    name: "Grass",
    dark: true,
    colors: {
      background: "#13773d", foreground: "#fff0a5", cursor: "#d9744c", cursorAccent: "#13773d",
      selectionBackground: "#b64926",
      black: "#000000", red: "#ff5959", green: "#00bb00", yellow: "#e7b000",
      blue: "#0000a3", magenta: "#ee59bb", cyan: "#00bbbb", white: "#bbbbbb",
      brightBlack: "#959595", brightRed: "#ff5959", brightGreen: "#00bb00", brightYellow: "#e7b000",
      brightBlue: "#0000bb", brightMagenta: "#ff55ff", brightCyan: "#55ffff", brightWhite: "#ffffff",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    dark: true,
    colors: {
      background: "#224fbc", foreground: "#ffffff", cursor: "#7f7f7f", cursorAccent: "#224fbc",
      selectionBackground: "#216dff",
      black: "#000000", red: "#e64c4c", green: "#00a600", yellow: "#999900",
      blue: "#0000b2", magenta: "#d826d8", cyan: "#00a6b2", white: "#bfbfbf",
      brightBlack: "#808080", brightRed: "#ff1a1a", brightGreen: "#00d900", brightYellow: "#e5e500",
      brightBlue: "#7373ff", brightMagenta: "#e500e5", brightCyan: "#00e5e5", brightWhite: "#e5e5e5",
    },
  },
  {
    id: "red-sands",
    name: "Red Sands",
    dark: true,
    colors: {
      background: "#7a251e", foreground: "#d7c9a7", cursor: "#ffffff", cursorAccent: "#7a251e",
      selectionBackground: "#a4a390",
      black: "#000000", red: "#ff3f00", green: "#00bb00", yellow: "#e7b000",
      blue: "#0072ff", magenta: "#bb00bb", cyan: "#00bbbb", white: "#bbbbbb",
      brightBlack: "#6e6e6e", brightRed: "#d41a1a", brightGreen: "#00bb00", brightYellow: "#e7b000",
      brightBlue: "#0072ae", brightMagenta: "#ff55ff", brightCyan: "#55ffff", brightWhite: "#ffffff",
    },
  },
  {
    id: "man-page",
    name: "Man Page",
    dark: false,
    colors: {
      background: "#fef49c", foreground: "#000000", cursor: "#7f7f7f", cursorAccent: "#fef49c",
      selectionBackground: "#a4c9cd",
      black: "#000000", red: "#cc0000", green: "#00a600", yellow: "#999900",
      blue: "#0000b2", magenta: "#b200b2", cyan: "#00a6b2", white: "#b2b2b2",
      brightBlack: "#666666", brightRed: "#e50000", brightGreen: "#00cc00", brightYellow: "#bfbf00",
      brightBlue: "#0000ff", brightMagenta: "#e500e5", brightCyan: "#00cbcb", brightWhite: "#e5e5e5",
    },
  },
  {
    id: "novel",
    name: "Novel",
    dark: false,
    colors: {
      background: "#dfdbc3", foreground: "#3b2322", cursor: "#73635a", cursorAccent: "#dfdbc3",
      selectionBackground: "#a4a390",
      black: "#000000", red: "#cc0000", green: "#009600", yellow: "#d06b00",
      blue: "#0000cc", magenta: "#cc00cc", cyan: "#0087cc", white: "#a6a6a6",
      brightBlack: "#808080", brightRed: "#cc0000", brightGreen: "#009600", brightYellow: "#d06b00",
      brightBlue: "#0000cc", brightMagenta: "#cc00cc", brightCyan: "#0087cc", brightWhite: "#ffffff",
    },
  },
];

/** The app's own surface colors per mode; keep in sync with --bg / --text / --accent in App.css. */
const APP = {
  dark: { bg: "#0e0f11", fg: "#e4e5e9", accent: "#4c9aff", selection: "rgba(76, 154, 255, 0.35)" },
  light: { bg: "#ffffff", fg: "#1d1d1f", accent: "#0a6cf5", selection: "rgba(10, 108, 245, 0.22)" },
};

/**
 * The colors a terminal actually uses. A terminal theme supplies the text palette only:
 * the pane background always comes from the app's dark/light theme. When a theme was
 * designed for the other mode, its default text color would vanish on the app background,
 * so the default text, cursor and selection fall back to the app's.
 */
export function effectiveColors(theme: TermTheme, appDark: boolean): TermTheme["colors"] {
  const app = appDark ? APP.dark : APP.light;
  const base = { ...theme.colors, background: app.bg, cursorAccent: app.bg };
  if (theme.dark === appDark) return base;
  return { ...base, foreground: app.fg, cursor: app.accent, selectionBackground: app.selection };
}

export function resolveTerminalTheme(id: string, appDark: boolean): TermTheme {
  const want = id === AUTO_THEME ? (appDark ? "default-dark" : "default-light") : id;
  return TERMINAL_THEMES.find((t) => t.id === want) ?? TERMINAL_THEMES[appDark ? 0 : 1];
}
