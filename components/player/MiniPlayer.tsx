"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Loader2, X, Maximize2 } from "lucide-react";
import { Artwork } from "../Artwork";
import { usePlayer, useTransport } from "./PlayerProvider";

/**
 * Compact transport strip for use INSIDE a panel.
 *
 * The full NowPlayingBar is `fixed bottom-0 z-50`, and the Selector sheet is
 * `fixed inset-0 z-[58]` at full height — so whenever the Selector was open the
 * player bar was buried underneath it. You could start a 30-second preview from
 * a result row and then get nothing: no transport, no progress, no elapsed
 * time, and no way to pause except finding and re-tapping the same artwork.
 *
 * This renders in normal flow wherever it's placed, so a panel can carry its
 * own transport without fighting the global bar for z-index.
 */
export function MiniPlayer({
  onExpand,
  className = "",
}: {
  /** Optional — shows a button to open the full visualiser. */
  onExpand?: () => void;
  className?: string;
}) {
  const { current, playing, loading, hasAudio, error, toggle, stop, seek } =
    usePlayer();
  const { progress, elapsed, duration } = useTransport();
  const barRef = useRef<HTMLDivElement>(null);

  const time = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const scrub = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const { left, width } = el.getBoundingClientRect();
    if (width > 0) seek((clientX - left) / width);
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
          className={`relative overflow-hidden rounded-2xl border border-chrome-700/50 ${className}`}
          // The same brushed faceplate as the main transport, so the two read
          // as one machine rather than a player and a lookalike.
          style={{
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)," +
              "linear-gradient(180deg, rgba(38,46,55,0.9), rgba(22,27,33,0.92))",
            boxShadow: "inset 0 1px 0 rgba(231,235,238,0.14)",
          }}
        >
          {/* progress — the whole strip's top edge, tappable to scrub */}
          <div
            ref={barRef}
            // Capture the pointer, or the drag dies the moment a finger drifts
            // off a 16px-tall strip — which on a phone is almost immediately.
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrub(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e.clientX);
            }}
            role="slider"
            aria-label="Seek within preview"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seek(Math.min(1, progress + 0.05));
              if (e.key === "ArrowLeft") seek(Math.max(0, progress - 0.05));
            }}
            className="group absolute inset-x-0 top-0 z-10 h-4 cursor-pointer touch-none"
          >
            <div className="absolute inset-x-0 top-0 h-[3px] bg-deck shadow-[inset_0_1px_1px_rgba(0,0,0,0.8)]">
              <div
                className="h-full bg-transport transition-[width] duration-150"
                style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 p-2.5 pt-3.5">
            <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
              <Artwork
                src={current.artwork_url}
                artist={current.artist}
                title={current.title}
                sizes="44px"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight text-ink">
                {current.title}
              </p>
              <p className="truncate text-[11px] text-ink/55">{current.artist}</p>
              {/* Say what's actually happening. A silent 30-second clip that
                  won't load is the most confusing possible state. */}
              {error ? (
                <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-sport">
                  {error}
                </p>
              ) : !hasAudio && !loading ? (
                <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-ink/35">
                  No preview available
                </p>
              ) : (
                // LCD green, like the main bar's readout. The length used to
                // fall back to a hard-coded "0:30" — a guess shown as a fact.
                <p
                  className="mt-0.5 font-mono text-[10px] tabular-nums text-lcd/80"
                  style={{ textShadow: "0 0 5px rgba(126,217,174,0.4)" }}
                >
                  {duration ? time(elapsed) : "-:--"} / {duration ? time(duration) : "-:--"}
                  <span className="ml-1.5 text-lcd/40">preview</span>
                </p>
              )}
            </div>

            <button
              onClick={toggle}
              disabled={!hasAudio && !loading}
              aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
              className="flex h-10 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-[#b84516] bg-transport text-deck shadow-key transition-[box-shadow,transform] active:translate-y-px active:shadow-keyed disabled:border-chrome-700/60 disabled:bg-deck-600 disabled:bg-none disabled:text-ink-600"
            >
              {loading ? (
                <Loader2 size={17} className="animate-spin" />
              ) : playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} className="ml-0.5" fill="currentColor" />
              )}
            </button>

            {onExpand && (
              <button
                onClick={onExpand}
                aria-label="Open visualiser"
                className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] border border-chrome-700/70 bg-deck-600 text-ink-400 shadow-key transition-[box-shadow,transform,color] hover:text-ink active:translate-y-px active:shadow-keyed sm:flex"
              >
                <Maximize2 size={15} />
              </button>
            )}

            <button
              onClick={stop}
              aria-label="Stop preview"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] text-ink-600 transition-colors hover:bg-deck-600 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
