"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Mic2 } from "lucide-react";
import { useScrollLock } from "@/lib/useScrollLock";
import { useDialog } from "@/lib/useDialog";
import { useBackClose } from "@/lib/useBackClose";
import { Portal } from "./Portal";

export interface LyricsSubject {
  artist: string;
  title: string;
}

/**
 * Full-height lyrics overlay. Fetches keyless lyrics for the given song and
 * renders them with calm, readable typography.
 */
export function LyricsPanel({ subject, onClose }: { subject: LyricsSubject | null; onClose: () => void }) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "done" | "none" | "error">("loading");
  // Bumped by "Try again" to re-run the lookup after a failure.
  const [attempt, setAttempt] = useState(0);
  useScrollLock(Boolean(subject));
  // This overlay opens OVER the release panel, in its own portal. Without these
  // it wasn't part of the overlay stack: Escape and Back skipped it and closed
  // the release panel underneath, focus stayed behind it, and the release
  // panel's Tab trap kept keyboard users out of it entirely.
  useBackClose(Boolean(subject), onClose);
  const dialogRef = useDialog<HTMLDivElement>(Boolean(subject), { modal: true });

  useEffect(() => {
    if (!subject) return;
    let cancelled = false;
    setState("loading");
    setLyrics(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/lyrics?artist=${encodeURIComponent(subject.artist)}&title=${encodeURIComponent(subject.title)}`
        );
        const data = await res.json();
        if (cancelled) return;
        // A failed lookup is not "this song has no lyrics" — say which it is.
        if (!res.ok || data.error) {
          setState("error");
          return;
        }
        if (typeof data.lyrics === "string" && data.lyrics.trim()) {
          setLyrics(data.lyrics.trim());
          setState("done");
        } else {
          setState("none");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject, attempt]);

  if (!subject) return null;

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 480, damping: 40 }}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={subject ? `Lyrics — ${subject.artist}, ${subject.title}` : "Lyrics"}
      className="fixed inset-0 z-[56] flex flex-col bg-[#0b0d10]/[0.98] backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:w-1/2"
    >
      <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(80% 100% at 0% 0%, rgba(78,134,199,0.22), transparent 60%)" }}
        />
        <button
          onClick={onClose}
          aria-label="Back"
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-ink/75 hover:border-white/50 hover:text-ink"
        >
          <span className="text-lg leading-none">‹</span>
        </button>
        <div className="relative min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.3em] text-tps/80">
            <Mic2 size={11} /> Lyrics
          </p>
          <h3 className="truncate text-base font-bold uppercase tracking-tight text-ink">
            {subject.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-white/10 hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
        {state === "loading" && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-tps" />
            <p className="text-[11px] uppercase tracking-widest text-ink/40">Finding lyrics…</p>
          </div>
        )}
        {state === "none" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Mic2 size={26} className="text-ink/20" />
            <p className="text-[12px] uppercase tracking-widest text-ink/40">No lyrics found</p>
            <p className="max-w-[240px] text-[11px] text-ink/30">
              Lyrics aren't documented for this track yet.
            </p>
          </div>
        )}
        {state === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Mic2 size={26} className="text-ink/20" />
            <p className="text-[12px] uppercase tracking-widest text-ink/50">Lyrics unavailable right now</p>
            <p className="max-w-[240px] text-[11px] text-ink/40">
              The lyrics service didn&rsquo;t answer. That says nothing about this track.
            </p>
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="min-h-9 rounded-[10px] border border-chrome-700/70 bg-deck-600 px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-ink shadow-key active:translate-y-px active:shadow-keyed"
            >
              Try again
            </button>
          </div>
        )}
        {state === "done" && lyrics && (
          <pre className="mx-auto max-w-prose whitespace-pre-wrap text-center font-sans text-[15px] leading-[1.9] text-ink/85">
            {lyrics}
          </pre>
        )}
      </div>
      {state === "done" && (
        <p className="border-t border-white/10 py-2 text-center text-[9px] uppercase tracking-[0.2em] text-ink/25">
          Lyrics via lyrics.ovh
        </p>
      )}
    </motion.div>
    </Portal>
  );
}
