"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, X, Maximize2, Loader2 } from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import { Artwork } from "../Artwork";
import { Visualizer } from "../Visualizer";
import { CrateIcon } from "../CrateIcon";
import { inPlaylist } from "@/lib/collection";
import type { Release } from "@/lib/types";

/**
 * Now-Playing bar — persistent bottom transport (Apple/Spotify/Tidal
 * pattern), reimagined in the Pulsar cosmos aesthetic. Plays 30s previews
 * inline while browsing; a scrubbable progress line; expand opens the
 * full 3D visualizer.
 */
export function NowPlayingBar() {
  const { current, playing, loading, progress, hasAudio, toggle, stop, seek, ensureGraph } = usePlayer();
  const [expanded, setExpanded] = useState<Release | null>(null);
  const [inCrate, setInCrate] = useState(false);

  useEffect(() => {
    const sync = () => setInCrate(current ? inPlaylist(current.id) : false);
    sync();
    window.addEventListener("pulsar-collection-change", sync);
    return () => window.removeEventListener("pulsar-collection-change", sync);
  }, [current]);

  function openVisualizer() {
    // Build the analyser in-gesture (desktop only); mobile uses idle visuals.
    ensureGraph();
    if (current) setExpanded(current);
  }

  return (
    <>
      <AnimatePresence>
        {current && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-star-white/10 bg-[#08080f]/90 backdrop-blur-xl"
          >
            {/* scrub line */}
            <button
              className="group absolute -top-1 left-0 right-0 h-2 cursor-pointer"
              aria-label="Seek"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek((e.clientX - rect.left) / rect.width);
              }}
            >
              <div className="absolute top-1 left-0 right-0 h-0.5 bg-star-white/10" />
              <div
                className="absolute top-1 left-0 h-0.5 bg-gradient-to-r from-neon-violet to-neon-blue transition-[width]"
                style={{ width: `${progress * 100}%` }}
              />
            </button>

            <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2.5 md:px-8">
              {/* artwork + meta */}
              <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md">
                <Artwork src={current.artwork_url} artist={current.artist} title={current.title} sizes="44px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold uppercase tracking-wide text-star-white">
                  {current.title}
                </p>
                <p className="truncate text-[11px] text-star-white/50">{current.artist}</p>
              </div>

              {/* equalizer flourish while playing */}
              {playing && (
                <div className="hidden items-end gap-0.5 sm:flex" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <motion.span
                      key={i}
                      className="w-0.5 rounded-full bg-neon-blue/70"
                      animate={{ height: [4, 12, 6, 14, 4] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                    />
                  ))}
                </div>
              )}

              {/* add to crate — brown crate glyph */}
              <button
                onClick={() => current && window.dispatchEvent(new CustomEvent("pulsar-crate-picker", { detail: current }))}
                aria-label="Add to a crate"
                title={inCrate ? "In a crate" : "Add to a crate"}
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                  inCrate ? "border-[#c08a4e]/60 bg-[#c08a4e]/15" : "border-white/25 bg-white/[0.06] hover:border-white/50"
                }`}
              >
                <CrateIcon
                  size={17}
                  filled={inCrate}
                  className={inCrate ? "text-[#c08a4e]" : "text-star-white/60"}
                />
              </button>

              {/* play / pause */}
              <button
                onClick={toggle}
                disabled={!hasAudio && !loading}
                aria-label={playing ? "Pause" : "Play"}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                style={{ background: "linear-gradient(160deg, #f0f0f4, #c4c4cc)" }}
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin text-void" />
                ) : playing ? (
                  <Pause size={18} className="text-void" fill="currentColor" />
                ) : (
                  <Play size={18} className="ml-0.5 text-void" fill="currentColor" />
                )}
              </button>

              {/* expand → visualizer */}
              <button
                onClick={openVisualizer}
                aria-label="Open visualizer"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-star-white/15 text-star-white/60 transition-colors hover:border-star-white/40 hover:text-star-white"
              >
                <Maximize2 size={15} />
              </button>

              {/* close */}
              <button
                onClick={stop}
                aria-label="Close player"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-star-white/40 transition-colors hover:bg-star-white/10 hover:text-star-white"
              >
                <X size={16} />
              </button>
            </div>

            {!hasAudio && !loading && (
              <p className="pb-1.5 text-center text-[9px] font-bold uppercase tracking-[0.25em] text-neon-amber/60">
                No preview available for this release
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Visualizer release={expanded} onClose={() => setExpanded(null)} />
    </>
  );
}
