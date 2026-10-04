"use client";

import { useBackClose } from "@/lib/useBackClose";
import { useScrollLock } from "@/lib/useScrollLock";
import { useDialog } from "@/lib/useDialog";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Sparkles, CloudUpload, Check } from "lucide-react";
import { CalabiYau } from "./CalabiYau";
import { CrateIcon } from "./CrateIcon";
import { FORMATS, loadFormat, saveFormat, type MediaFormat } from "@/lib/format";
import { THEMES, loadTheme, saveTheme } from "@/lib/theme";
import { getFavorites, getPlaylist } from "@/lib/collection";
import { currentUserId, onAuthChange, signInWithEmail, signOut, syncConfigured } from "@/lib/sync";
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
/**
 * A labelled group in the menu.
 *
 * Declared at module level on purpose. It used to be defined INSIDE Sidebar,
 * which makes it a brand-new component type on every render — so React
 * unmounted and remounted every section whenever any state changed. Typing in
 * the sign-in email field sets state, so the input was replaced after each
 * keystroke and lost focus: you could type one character at a time.
 */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink/[0.06] px-5 py-5">
      <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.3em] text-ink-400">{label}</p>
      {children}
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  // The menu was the one overlay outside the stack: Escape and Back did
  // nothing to it, focus stayed behind it, and the page scrolled underneath.
  useBackClose(open, () => setOpen(false));
  useScrollLock(open);
  const dialogRef = useDialog<HTMLElement>(open);
  const [format, setFormat] = useState<MediaFormat>("vinyl");
  const [themeId, setThemeId] = useState("tps-l2");
  const [aiMode, setAiMode] = useState<AiMode>("chat");
  const [showType, setShowType] = useState<ShowType>("all");
  const [counts, setCounts] = useState({ fav: 0, crate: 0 });
  const [syncUser, setSyncUser] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");

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
    // Sync auth state (only when Supabase is configured).
    if (syncConfigured()) {
      currentUserId().then(setSyncUser);
      onAuthChange(setSyncUser);
    }
    return () => {
      window.removeEventListener("pulsar-toggle-sidebar", toggle);
      window.removeEventListener("pulsar-collection-change", change);
    };
  }, []);

  const sendLink = async () => {
    if (!email.trim() || !email.includes("@")) return;
    setEmailState("sending");
    const ok = await signInWithEmail(email.trim());
    setEmailState(ok ? "sent" : "error");
  };

  const openCrate = (which: "favorites" | "playlist") => {
    window.dispatchEvent(new CustomEvent("pulsar-open-crate", { detail: which }));
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[55] bg-deck/70 backdrop-blur-sm"
          />
          <motion.aside
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 520, damping: 42 }}
            className="fixed inset-y-0 left-0 z-[55] flex w-[92%] max-w-sm transform-gpu flex-col overflow-y-auto border-r border-white/15 bg-[#12161a]/60 backdrop-blur-2xl"
            style={{ boxShadow: "inset -1px 0 0 rgba(255,255,255,0.14), 20px 0 60px rgba(0,0,0,0.5)" }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-5">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5"
                aria-label="Pulsar home"
              >
                <CalabiYau size={26} />
                <span className="text-base font-bold uppercase tracking-[0.3em] text-ink">
                  Pulsar
                </span>
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink/60 transition-colors hover:border-ink/40 hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            {/* Crates */}
            <Section label="Crates">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => openCrate("favorites")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-ink/10 bg-ink/[0.03] p-3 transition-colors hover:border-ink/30"
                >
                  <Heart size={18} className="text-vu" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink">
                    Favorites
                  </span>
                  <span className="text-[10px] text-ink/40">{counts.fav} loved</span>
                </button>
                <button
                  onClick={() => openCrate("playlist")}
                  className="flex flex-col items-start gap-2 rounded-xl border border-ink/10 bg-ink/[0.03] p-3 transition-colors hover:border-ink/30"
                >
                  <CrateIcon size={18} filled className="text-[#c08a4e]" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink">
                    Crate
                  </span>
                  <span className="text-[10px] text-ink/40">{counts.crate} saved</span>
                </button>
              </div>
            </Section>

            {/* Sync — cross-device collection (only when Supabase auth is on) */}
            {syncConfigured() && (
              <Section label="Sync">
                {syncUser ? (
                  <div className="rounded-xl border border-tps/30 bg-tps/[0.08] p-3">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink">
                      <Check size={14} className="text-tps" />
                      Synced across devices
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-ink/40">
                      Your crates &amp; favorites mirror to your account.
                    </p>
                    <button
                      onClick={() => signOut()}
                      className="mt-2.5 flex min-h-[36px] w-full items-center justify-center rounded-lg border border-ink/15 text-[10px] font-bold uppercase tracking-wide text-ink/60 transition-colors hover:border-ink/40 hover:text-ink"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-3">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink">
                      <CloudUpload size={14} className="text-sony" />
                      Keep my collection
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-ink/40">
                      Enter your email — we&apos;ll send a magic link to sync crates &amp; favorites
                      across devices.
                    </p>
                    {emailState === "sent" ? (
                      <p className="mt-2.5 rounded-lg border border-tps/30 bg-tps/10 px-3 py-2 text-[11px] text-tps">
                        Check your email for the sign-in link.
                      </p>
                    ) : (
                      <div className="mt-2.5 flex gap-1.5">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sendLink()}
                          placeholder="you@email.com"
                          aria-label="Email for magic link"
                          className="min-h-[40px] flex-1 rounded-lg border border-ink/15 bg-deck/60 px-3 text-[12px] text-ink outline-none placeholder:text-ink/25 focus:border-sony/50"
                        />
                        <button
                          onClick={sendLink}
                          disabled={emailState === "sending"}
                          className="min-h-[40px] flex-shrink-0 rounded-lg bg-sony px-3 text-[11px] font-bold uppercase tracking-wide text-deck transition-opacity disabled:opacity-50"
                        >
                          {emailState === "sending" ? "…" : "Link"}
                        </button>
                      </div>
                    )}
                    {emailState === "error" && (
                      <p className="mt-2 text-[10px] text-sport">Couldn&apos;t send — try again.</p>
                    )}
                  </div>
                )}
              </Section>
            )}

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
                        ? "border-ink/40 bg-ink/[0.06]"
                        : "border-ink/10 hover:border-ink/25"
                    }`}
                  >
                    <span className="text-[12px] font-bold uppercase tracking-wide text-ink">
                      {f.label}
                    </span>
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
                        ? "border-ink/40 bg-ink/[0.06]"
                        : "border-ink/10 hover:border-ink/25"
                    }`}
                  >
                    <span className="flex -space-x-1">
                      {t.swatch.map((c) => (
                        <span
                          key={c}
                          className="h-4 w-4 rounded-full ring-1 ring-deck"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-wide text-ink">
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
                        ? "border-ink/40 bg-ink/[0.06] text-ink"
                        : "border-ink/10 text-ink/50 hover:text-ink"
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
                        ? "border-sony/50 bg-sony/10 text-ink"
                        : "border-ink/10 text-ink/50 hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-ink/35">
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
                className="flex w-full items-center gap-3 rounded-xl border border-sony/30 bg-sony/10 px-3 py-3 text-left transition-colors hover:bg-sony/20"
              >
                <Sparkles size={18} className="text-sony" />
                <span className="flex-1">
                  <span className="block text-[12px] font-bold uppercase tracking-wide text-ink">
                    Retake the vibe quiz
                  </span>
                  <span className="block text-[10px] text-ink/40">
                    Re-tune recommendations &amp; theme
                  </span>
                </span>
              </button>
            </Section>

            <div className="mt-auto px-5 py-5 text-[9px] font-bold uppercase tracking-[0.24em] text-ink/25">
              Music discovery
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
