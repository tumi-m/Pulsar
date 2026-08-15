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
  const { current, playing, loading, progress, elapsed, duration, hasAudio, error, toggle, stop, seek, ensureGraph, play } =
    usePlayer();
  const [expanded, setExpanded] = useState<Release | null>(null);
  const [inCrate, setInCrate] = useState(false);
  // "Where do you want to go?" sheet, opened by tapping the track info.
  const [menuOpen, setMenuOpen] = useState(false);
  // Scrub state — while dragging we show the dragged position, not the audio's,
  // so the bar doesn't fight the user's finger.
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const shownProgress = scrubValue ?? progress;

  const fractionFrom = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const fmt = (s: number) =>
    Number.isFinite(s) && s > 0
      ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
      : "0:00";

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

            {/* Scrubber — a real drag target. The old one was a 2px line with a
                click handler: impossible to hit on a phone and impossible to
                drag anywhere. */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(shownProgress * 100)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") seek(Math.min(1, progress + 0.05));
                if (e.key === "ArrowLeft") seek(Math.max(0, progress - 0.05));
              }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setScrubbing(true);
                setScrubValue(fractionFrom(e));
              }}
              onPointerMove={(e) => {
                if (scrubbing) setScrubValue(fractionFrom(e));
              }}
              onPointerUp={(e) => {
                if (!scrubbing) return;
                const f = fractionFrom(e);
                seek(f);
                setScrubbing(false);
                setScrubValue(null);
              }}
              onPointerCancel={() => {
                setScrubbing(false);
                setScrubValue(null);
              }}
              className="group absolute -top-2 left-0 right-0 z-10 h-5 cursor-pointer touch-none"
            >
              <div className="absolute top-2 left-0 right-0 h-1 rounded-full bg-star-white/12" />
              <div
                className={`absolute top-2 left-0 h-1 rounded-full bg-gradient-to-r from-neon-violet to-neon-blue ${
                  scrubbing ? "" : "transition-[width]"
                }`}
                style={{ width: `${shownProgress * 100}%` }}
              />
              {/* thumb — appears on hover, always visible while dragging */}
              <span
                className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-opacity ${
                  scrubbing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                style={{ left: `${shownProgress * 100}%` }}
              />
            </div>

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

              {/* elapsed / total — previews are short, so knowing where you are
                  actually matters */}
              <span className="hidden flex-shrink-0 font-mono text-[11px] tabular-nums text-star-white/40 sm:block">
                {fmt(scrubbing ? shownProgress * duration : elapsed)}
                <span className="text-star-white/20"> / </span>
                {fmt(duration)}
              </span>

              {/* equalizer flourish while playing */}
              {playing && !scrubbing && (
                <div className="hidden items-end gap-0.5 md:flex" aria-hidden>
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
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
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
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                style={{
                  background: "linear-gradient(160deg, #f0f0f4, #c4c4cc)",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
                }}
              >
                {loading ? (
                  <Loader2 size={20} className="animate-spin text-void" />
                ) : playing ? (
                  <Pause size={20} className="text-void" fill="currentColor" />
                ) : (
                  <Play size={20} className="ml-0.5 text-void" fill="currentColor" />
                )}
              </button>

              {/* expand → visualizer. Hidden on the narrowest screens: it's
                  reachable from the track menu, and four buttons crush the
                  title on a small phone. */}
              <button
                onClick={openVisualizer}
                aria-label="Open visualizer"
                className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-star-white/15 text-star-white/60 transition-colors hover:border-star-white/40 hover:text-star-white sm:flex"
              >
                <Maximize2 size={16} />
              </button>

              {/* close — kept last and visually quietest so it's never mistaken
                  for a transport control */}
              <button
                onClick={stop}
                aria-label="Close player"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-star-white/35 transition-colors hover:bg-star-white/10 hover:text-star-white"
              >
                <X size={17} />
              </button>
            </div>

            {error && !loading && (
              <button
                onClick={() => current && play(current)}
                className="pb-1.5 text-center text-[9px] font-bold uppercase tracking-[0.25em] text-neon-amber/70 transition-colors hover:text-neon-amber"
              >
                {error} — tap to retry
              </button>
            )}
            {!hasAudio && !loading && !error && (
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
