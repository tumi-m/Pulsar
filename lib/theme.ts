/**
 * Pulsar — Themes
 *
 * A theme is a full-page background wash + a hero wordmark gradient. Each one
 * is a real Walkman: the palette in app/globals.css is the machine's, and these
 * are the finishes it shipped in. Persisted to localStorage and broadcast so the themed
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
    // The original, 1979. Blue-and-silver housing, orange transport keys.
    id: "tps-l2",
    name: "TPS-L2",
    swatch: ["#4e86c7", "#c6ccd2", "#f2662c"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(78,134,199,0.20) 0%, transparent 60%)," +
      "radial-gradient(ellipse 55% 45% at 84% 78%, rgba(242,102,44,0.13) 0%, transparent 62%)," +
      "radial-gradient(ellipse 52% 42% at 12% 70%, rgba(199,206,213,0.07) 0%, transparent 62%)," +
      "#0b0d10",
    hero: "linear-gradient(118deg, #e7ebee 0%, #bac2c9 16%, #4e86c7 52%, #f2662c 100%)",
  },
  {
    // WM-F5, 1983 — the yellow splashproof one you took running.
    id: "sports",
    name: "Sports",
    swatch: ["#ffce0a", "#f2662c", "#1c1f22"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(255,206,10,0.16) 0%, transparent 60%)," +
      "radial-gradient(ellipse 55% 45% at 82% 80%, rgba(242,102,44,0.16) 0%, transparent 62%)," +
      "radial-gradient(ellipse 50% 42% at 14% 68%, rgba(255,206,10,0.08) 0%, transparent 62%)," +
      "#0f0d08",
    hero: "linear-gradient(118deg, #fff6d0 0%, #ffce0a 38%, #f2662c 100%)",
  },
  {
    // WM-D6C Professional — black, chrome, and a record button.
    id: "pro",
    name: "Professional",
    swatch: ["#1a2027", "#bac2c9", "#e23b2e"],
    bg:
      "radial-gradient(ellipse 72% 58% at 50% -6%, rgba(186,194,201,0.10) 0%, transparent 62%)," +
      "radial-gradient(ellipse 55% 45% at 84% 82%, rgba(226,59,46,0.10) 0%, transparent 62%)," +
      "#08090b",
    hero: "linear-gradient(118deg, #ffffff 0%, #bac2c9 46%, #e23b2e 100%)",
  },
  {
    // WM-DD9 — champagne and gunmetal, the one built like a watch.
    id: "dd9",
    name: "DD9",
    swatch: ["#c8b487", "#59626b", "#e7ebee"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(200,180,135,0.14) 0%, transparent 60%)," +
      "radial-gradient(ellipse 55% 45% at 80% 78%, rgba(89,98,107,0.22) 0%, transparent 62%)," +
      "#0a0a0c",
    hero: "linear-gradient(118deg, #f4ecd8 0%, #c8b487 44%, #8b949d 100%)",
  },
  {
    // The tape rather than the deck: TDK-style J-card cream over oxide brown.
    id: "chrome-tape",
    name: "Chrome Tape",
    swatch: ["#efe4cc", "#3a2a20", "#7ed9ae"],
    bg:
      "radial-gradient(ellipse 70% 55% at 50% -5%, rgba(239,228,204,0.11) 0%, transparent 60%)," +
      "radial-gradient(ellipse 55% 48% at 82% 80%, rgba(58,42,32,0.45) 0%, transparent 64%)," +
      "radial-gradient(ellipse 50% 42% at 14% 70%, rgba(126,217,174,0.08) 0%, transparent 62%)," +
      "#0c0a09",
    hero: "linear-gradient(118deg, #efe4cc 0%, #c8b487 40%, #7ed9ae 100%)",
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
