"use client";

import { useEffect, useState } from "react";
import { loadTheme, themeById, THEMES, type Theme } from "./theme";

/**
 * The active Walkman finish, live.
 *
 * ThemedBackground had this subscription inline and it was the only consumer,
 * which is why `Theme.hero` — a gradient defined on all five themes — was
 * never read by anything: the letterhead used a fixed gradient, so switching
 * theme repainted the background wash and left the wordmark alone. Picking
 * "Sports" and getting two thirds of Sports is worse than not offering it.
 *
 * Starts on THEMES[0] rather than reading storage during render, so the server
 * and the first client render agree; the stored choice arrives in the effect.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);

  useEffect(() => {
    setTheme(loadTheme());
    const onChange = (e: Event) => setTheme(themeById((e as CustomEvent<string>).detail));
    window.addEventListener("pulsar-theme-change", onChange);
    return () => window.removeEventListener("pulsar-theme-change", onChange);
  }, []);

  return theme;
}
