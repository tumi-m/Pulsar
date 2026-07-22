/**
 * Pulsar — Themes
 *
 * A theme is mostly a background "nebula" gradient + a hero wordmark
 * gradient. Persisted to localStorage and broadcast so the themed
 * background and hero react instantly. The onboarding quiz picks a
 * starting theme from the user's answers.
 */

export interface Theme {
  id: string;
  name: string;
  swatch: [string, string, string];
  bg: string; // fixed full-page background
  hero: string; // hero wordmark gradient
}

export const THEMES: Theme[] = [
  {
    id: "nebula",
    name: "Nebula",
    swatch: ["#9b5de5", "#00d4ff", "#ff0080"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(155,93,229,0.22) 0%, transparent 60%)," +
      "radial-gradient(ellipse 55% 45% at 82% 78%, rgba(0,212,255,0.16) 0%, transparent 62%)," +
      "radial-gradient(ellipse 50% 40% at 12% 68%, rgba(255,0,128,0.14) 0%, transparent 62%)," +
      "#06061a",
    hero: "linear-gradient(120deg, #e8e8f4 0%, #9b5de5 55%, #00d4ff 100%)",
  },
  {
    id: "solaris",
    name: "Solaris",
    swatch: ["#ffb347", "#ff5fa2", "#ff7b00"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(255,123,0,0.22) 0%, transparent 60%)," +
      "radial-gradient(ellipse 55% 45% at 82% 78%, rgba(255,95,162,0.18) 0%, transparent 62%)," +
      "radial-gradient(ellipse 50% 45% at 14% 70%, rgba(255,179,71,0.14) 0%, transparent 62%)," +
      "#140a06",
    hero: "linear-gradient(120deg, #ffe8c9 0%, #ff9d5c 35%, #ff5fa2 100%)",
  },
  {
    id: "sagan",
    name: "Sagan",
    swatch: ["#0a3d62", "#f6b93b", "#60a3bc"],
    bg:
      "radial-gradient(ellipse 75% 60% at 50% -8%, rgba(96,163,188,0.20) 0%, transparent 62%)," +
      "radial-gradient(ellipse 55% 45% at 80% 82%, rgba(246,185,59,0.10) 0%, transparent 62%)," +
      "radial-gradient(ellipse 60% 50% at 15% 70%, rgba(10,61,98,0.35) 0%, transparent 62%)," +
      "#03060f",
    hero: "linear-gradient(120deg, #f6f0e0 0%, #f6b93b 40%, #60a3bc 100%)",
  },
  {
    id: "dream",
    name: "Dream",
    swatch: ["#f7a8c4", "#b28dff", "#8ce8ff"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(178,141,255,0.20) 0%, transparent 62%)," +
      "radial-gradient(ellipse 55% 45% at 80% 80%, rgba(247,168,196,0.18) 0%, transparent 62%)," +
      "radial-gradient(ellipse 55% 45% at 15% 70%, rgba(140,232,255,0.14) 0%, transparent 62%)," +
      "#0d0a16",
    hero: "linear-gradient(120deg, #fdeaf3 0%, #f7a8c4 40%, #b28dff 100%)",
  },
  {
    id: "escher",
    name: "Escher",
    swatch: ["#d8d8e0", "#8a8a99", "#3a3a44"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(216,216,224,0.10) 0%, transparent 60%)," +
      "radial-gradient(ellipse 55% 45% at 82% 80%, rgba(138,138,153,0.08) 0%, transparent 62%)," +
      "#0a0a0c",
    hero: "linear-gradient(120deg, #ffffff 0%, #b8b8c4 50%, #6a6a78 100%)",
  },
];

const KEY = "pulsar_theme_v1";

export function themeById(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function loadTheme(): Theme {
  try {
    return themeById(localStorage.getItem(KEY));
  } catch {
    return THEMES[0];
  }
}

export function saveTheme(id: string): void {
  try {
    localStorage.setItem(KEY, id);
    window.dispatchEvent(new CustomEvent("pulsar-theme-change", { detail: id }));
  } catch {
    /* noop */
  }
}
