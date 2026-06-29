import type { ColorUp, Theme } from "./store";

type Resolved = "light" | "dark";

interface Palette {
  bg: string;
  panel: string;
  panel2: string;
  border: string;
  muted: string;
  text: string;
}

const PALETTES: Record<Resolved, Palette> = {
  dark: {
    bg: "#0b0e14",
    panel: "#131722",
    panel2: "#1b2130",
    border: "#232a3a",
    muted: "#8b93a7",
    text: "#e6e8ef",
  },
  light: {
    bg: "#f5f6f8",
    panel: "#ffffff",
    panel2: "#eef0f4",
    border: "#d8dce4",
    muted: "#5b6473",
    text: "#1a1d24",
  },
};

// 漲/跌 base colours (Taiwan: red up, green down). The convention only decides
// which one is "up".
const RED = "#e23b3b";
const GREEN = "#1eb854";

export function resolveTheme(theme: Theme): Resolved {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

/** Concrete colours for the imperative charts (no CSS-var read → no ordering races). */
export function chartColors(theme: Theme, colorUp: ColorUp) {
  const p = PALETTES[resolveTheme(theme)];
  return {
    up: colorUp === "red" ? RED : GREEN,
    down: colorUp === "red" ? GREEN : RED,
    grid: p.panel2,
    border: p.border,
    text: p.muted,
  };
}

export function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Apply theme + colour convention to the document (CSS vars used by Tailwind). */
export function applyTheme(theme: Theme, colorUp: ColorUp) {
  const resolved = resolveTheme(theme);
  const p = PALETTES[resolved];
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  root.style.setProperty("--color-bg", p.bg);
  root.style.setProperty("--color-panel", p.panel);
  root.style.setProperty("--color-panel-2", p.panel2);
  root.style.setProperty("--color-border", p.border);
  root.style.setProperty("--color-muted", p.muted);
  root.style.setProperty("--color-text", p.text);
  root.style.setProperty("--color-up", colorUp === "red" ? RED : GREEN);
  root.style.setProperty("--color-down", colorUp === "red" ? GREEN : RED);
}
