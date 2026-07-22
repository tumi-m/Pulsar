"use client";

import { useEffect, useState } from "react";
import { loadTheme, themeById, THEMES, type Theme } from "@/lib/theme";

/**
 * Full-page themed nebula background. Reads the active theme and updates
 * live when it changes (from the sidebar or the onboarding quiz).
 */
export function ThemedBackground() {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);

  useEffect(() => {
    setTheme(loadTheme());
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setTheme(themeById(id));
    };
    window.addEventListener("pulsar-theme-change", onChange);
    return () => window.removeEventListener("pulsar-theme-change", onChange);
  }, []);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-[background] duration-700"
        style={{ background: theme.bg }}
      />
      <div
        className="animate-pulse-glow pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 30% at 65% 40%, rgba(255,255,255,0.05) 0%, transparent 70%)",
          opacity: 0.5,
        }}
      />
    </>
  );
}
