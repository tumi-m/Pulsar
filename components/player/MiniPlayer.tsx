"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Loader2, X, Maximize2 } from "lucide-react";
import { Artwork } from "../Artwork";
import { usePlayer } from "./PlayerProvider";

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
  const { current, playing, loading, progress, elapsed, duration, hasAudio, error, toggle, stop, seek } =
    usePlayer();
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
          className={`relative overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.04] ${className}`}
        >
          {/* progress — the whole strip's top edge, tappable to scrub */}
          <div
            ref={barRef}
            onPointerDown={(e) => scrub(e.clientX)}
            onPointerMove={(e) => {
              if (e.buttons === 1) scrub(e.clientX);
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
            <div className="absolute inset-x-0 top-0 h-[3px] bg-white/[0.08]">
              <div
                className="h-full bg-neon-blue transition-[width] duration-150"
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
              <p className="truncate text-[13px] font-bold leading-tight text-star-white">
                {current.title}
              </p>
              <p className="truncate text-[11px] text-star-white/55">{current.artist}</p>
              {/* Say what's actually happening. A silent 30-second clip that
                  won't load is the most confusing possible state. */}
              {error ? (
                <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-neon-amber">
                  {error}
                </p>
              ) : !hasAudio && !loading ? (
                <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-star-white/35">
                  No preview available
                </p>
              ) : (
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-star-white/40">
                  {time(elapsed)} / {duration ? time(duration) : "0:30"}
                  <span className="ml-1.5 text-star-white/25">preview</span>
                </p>
              )}
            </div>

            <button
              onClick={toggle}
              disabled={!hasAudio && !loading}
              aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neon-blue/90 text-void transition-transform active:scale-90 disabled:opacity-35"
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
                className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-star-white/60 transition-colors hover:border-white/40 hover:text-star-white sm:flex"
              >
                <Maximize2 size={15} />
              </button>
            )}

            <button
              onClick={stop}
              aria-label="Stop preview"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-star-white/35 transition-colors hover:bg-white/10 hover:text-star-white"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
