"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, X, Maximize2, Loader2, ChevronUp, Disc3, ListMusic, Sparkles } from "lucide-react";
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
  // "Where do you want to go?" sheet, opened by tapping the track info.
  const [menuOpen, setMenuOpen] = useState(false);

  // Close it whenever the track changes so it never describes the wrong song.
  useEffect(() => setMenuOpen(false), [current?.id]);

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
            className="fixed inset-x-0 bottom-0 z-50 border-t border-star-white/10 bg-[#08080f]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
          >
            {/* where-to menu — visualiser · full album · discography */}
            <AnimatePresence>
              {menuOpen && (
                <>
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 -z-10 cursor-default bg-void/60 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    className="absolute bottom-full left-4 mb-2 w-[min(88vw,300px)] overflow-hidden rounded-2xl border border-white/12 md:left-8"
                    style={{
                      background: "rgba(12,12,20,0.97)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 22px 60px rgba(0,0,0,0.7)",
                    }}
                  >
                    <p className="truncate border-b border-white/8 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
                      {current.artist}
                    </p>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        openVisualizer();
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-neon-violet/20 text-neon-violet">
                        <Sparkles size={15} />
                      </span>
                      <span className="text-[13px] font-medium text-star-white">Visualise</span>
                    </button>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        // ReleaseGrid owns the detail sheet; it opens the full
                        // project (resolving the parent album for a single).
                        window.dispatchEvent(
                          new CustomEvent("pulsar-open-release", { detail: current })
                        );
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-neon-blue/20 text-neon-blue">
                        <ListMusic size={15} />
                      </span>
                      <span className="text-[13px] font-medium text-star-white">Full album</span>
                    </button>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        window.dispatchEvent(
                          new CustomEvent("pulsar-open-discography", { detail: current })
                        );
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#c08a4e]/20 text-[#e0a45c]">
                        <Disc3 size={15} />
                      </span>
                      <span className="truncate text-[13px] font-medium text-star-white">
                        {current.artist}&rsquo;s discography
                      </span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

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
              {/* artwork + meta — tapping opens the "where to?" menu */}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label={`${current.title} by ${current.artist} — open options`}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pr-2 text-left transition-colors hover:bg-white/[0.05]"
              >
                <span className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md">
                  <Artwork src={current.artwork_url} artist={current.artist} title={current.title} sizes="44px" />
                  <span className="absolute inset-0 flex items-center justify-center bg-void/55 opacity-0 transition-opacity group-hover:opacity-100">
                    <ChevronUp size={16} className="text-white" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold uppercase tracking-wide text-star-white">
                    {current.title}
                  </span>
                  <span className="block truncate text-[11px] text-star-white/50">{current.artist}</span>
                </span>
              </button>

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
