"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, ListMusic, Sparkles } from "lucide-react";
import { FORMATS, loadFormat, saveFormat, type MediaFormat } from "@/lib/format";
import { THEMES, loadTheme, saveTheme } from "@/lib/theme";
import { getFavorites, getPlaylist } from "@/lib/collection";
import {
  loadAiMode,
  saveAiMode,
  loadShowType,
  saveShowType,
  type AiMode,
  type ShowType,
} from "@/lib/settings";

/**
 * Left slide-in sidebar — the hub for Crates, look & feel (format),
 * Theme, and Taste. Opens on the "pulsar-toggle-sidebar" event fired by
 * the navbar menu button.
 */
export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<MediaFormat>("vinyl");
  const [themeId, setThemeId] = useState("nebula");
  const [aiMode, setAiMode] = useState<AiMode>("chat");
  const [showType, setShowType] = useState<ShowType>("all");
  const [counts, setCounts] = useState({ fav: 0, crate: 0 });

  const refresh = () => setCounts({ fav: getFavorites().length, crate: getPlaylist().length });

  useEffect(() => {
    setFormat(loadFormat());
    setThemeId(loadTheme().id);
    setAiMode(loadAiMode());
    setShowType(loadShowType());
    refresh();
    const toggle = () => setOpen((v) => !v);
    const change = () => refresh();
    window.addEventListener("pulsar-toggle-sidebar", toggle);
    window.addEventListener("pulsar-collection-change", change);
    return () => {
      window.removeEventListener("pulsar-toggle-sidebar", toggle);
      window.removeEventListener("pulsar-collection-change", change);
    };
  }, []);

  const openCrate = (which: "favorites" | "playlist") => {
    window.dispatchEvent(new CustomEvent("pulsar-open-crate", { detail: which }));
    setOpen(false);
  };

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="border-t border-star-white/[0.06] px-5 py-5">
      <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.3em] text-star-white/35">{label}</p>
      {children}
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[55] bg-void/70 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 520, damping: 42 }}
            className="fixed inset-y-0 left-0 z-[55] flex w-[86%] max-w-xs transform-gpu flex-col overflow-y-auto border-r border-star-white/10 bg-[#08080f]/95 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <span className="text-sm font-bold uppercase tracking-[0.3em] text-star-white">Pulsar</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-star-white/15 text-star-white/60 transition-colors hover:border-star-white/40 hover:text-star-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Crates */}
            <Section label="Crates">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => openCrate("favorites")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-star-white/10 bg-star-white/[0.03] p-3 transition-colors hover:border-star-white/30"
                >
                  <Heart size={18} className="text-neon-pink" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-star-white">
                    Favorites
                  </span>
                  <span className="text-[10px] text-star-white/40">{counts.fav} loved</span>
                </button>
                <button
                  onClick={() => openCrate("playlist")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-star-white/10 bg-star-white/[0.03] p-3 transition-colors hover:border-star-white/30"
                >
                  <ListMusic size={18} className="text-neon-blue" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-star-white">
                    Crate
                  </span>
                  <span className="text-[10px] text-star-white/40">{counts.crate} saved</span>
                </button>
              </div>
            </Section>

            {/* Look & feel — media format */}
            <Section label="Look &amp; Feel">
              <div className="grid grid-cols-1 gap-1.5">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setFormat(f.id);
                      saveFormat(f.id);
                      window.dispatchEvent(new CustomEvent("pulsar-format-change", { detail: f.id }));
                    }}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                      format === f.id
                        ? "border-star-white/40 bg-star-white/[0.06]"
                        : "border-star-white/10 hover:border-star-white/25"
                    }`}
                  >
                    <span className="text-[12px] font-bold uppercase tracking-wide text-star-white">
                      {f.label}
                    </span>
                    <span className="text-[10px] text-star-white/35">{f.blurb}</span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Theme */}
            <Section label="Theme">
              <div className="grid grid-cols-1 gap-1.5">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setThemeId(t.id);
                      saveTheme(t.id);
                    }}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                      themeId === t.id
                        ? "border-star-white/40 bg-star-white/[0.06]"
                        : "border-star-white/10 hover:border-star-white/25"
                    }`}
                  >
                    <span className="flex -space-x-1">
                      {t.swatch.map((c) => (
                        <span
                          key={c}
                          className="h-4 w-4 rounded-full ring-1 ring-void"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-wide text-star-white">
                      {t.name}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Show — release type */}
            <Section label="Show">
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    ["all", "All"],
                    ["album", "Albums"],
                    ["ep", "EPs"],
                    ["single", "Tracks"],
                  ] as [ShowType, string][]
                ).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => {
                      setShowType(t);
                      saveShowType(t);
                    }}
                    className={`rounded-lg border py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      showType === t
                        ? "border-star-white/40 bg-star-white/[0.06] text-star-white"
                        : "border-star-white/10 text-star-white/50 hover:text-star-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Section>

            {/* AI Mode */}
            <Section label="AI Mode">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["survey", "Visual Survey"],
                    ["chat", "Chat"],
                  ] as [AiMode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => {
                      setAiMode(m);
                      saveAiMode(m);
                    }}
                    className={`rounded-lg border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                      aiMode === m
                        ? "border-neon-violet/50 bg-neon-violet/10 text-star-white"
                        : "border-star-white/10 text-star-white/50 hover:text-star-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-star-white/35">
                The AI button uses this: a visual taste quiz, or a chat to describe your mood.
              </p>
            </Section>

            {/* Taste */}
            <Section label="Taste">
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("pulsar-retake-quiz"));
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-neon-violet/30 bg-neon-violet/10 px-3 py-3 text-left transition-colors hover:bg-neon-violet/20"
              >
                <Sparkles size={18} className="text-neon-violet" />
                <span className="flex-1">
                  <span className="block text-[12px] font-bold uppercase tracking-wide text-star-white">
                    Retake the vibe quiz
                  </span>
                  <span className="block text-[10px] text-star-white/40">
                    Re-tune recommendations &amp; theme
                  </span>
                </span>
              </button>
            </Section>

            <div className="mt-auto px-5 py-5 text-[9px] font-bold uppercase tracking-[0.24em] text-star-white/25">
              Music discovery service
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
