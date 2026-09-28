"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, X, Maximize2, Loader2, ChevronUp, Disc3, ListMusic, Sparkles } from "lucide-react";
import { usePlayer, useTransport } from "./PlayerProvider";
import { LevelMeter } from "./LevelMeter";
import { Artwork } from "../Artwork";
import { Visualizer } from "../Visualizer";
import { CrateIcon } from "../CrateIcon";
import { inPlaylist } from "@/lib/collection";
import type { Release } from "@/lib/types";

/**
 * Now-Playing bar — the persistent bottom transport, built as the top panel of
 * a Walkman: brushed aluminium face, a groove the tape position runs along, an
 * LCD for time and level, and one orange key that does the thing you came for.
 * Plays 30s previews inline while browsing; expand opens the visualizer.
 */
export function NowPlayingBar() {
  const { current, playing, loading, hasAudio, error, toggle, stop, seek, ensureGraph, getAnalyser, play } =
    usePlayer();
  // Hot per-tick values come from the transport context — reading them here
  // keeps the 4×/s re-render scoped to this bar instead of every tile.
  const { progress, elapsed, duration } = useTransport();
  const [expanded, setExpanded] = useState<Release | null>(null);
  const [inCrate, setInCrate] = useState(false);
  // "Where do you want to go?" sheet, opened by tapping the track info.
  const [menuOpen, setMenuOpen] = useState(false);

  // Publish the bar's real height as --player-h so floating UI can sit above it.
  // It changes with the status line, safe-area inset and breakpoint, so it is
  // measured rather than assumed.
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    if (!current || !el) {
      root.style.setProperty("--player-h", "0px");
      return;
    }
    const publish = () => root.style.setProperty("--player-h", `${Math.ceil(el.offsetHeight)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--player-h", "0px");
    };
  }, [current]);
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
            ref={barRef}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-chrome-300/25 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
            style={{
              // Brushed aluminium: a fine vertical grain over a cool metal tone,
              // with the polished lip of the top bezel catching the light.
              background:
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)," +
                "linear-gradient(180deg, rgba(38,46,55,0.96) 0%, rgba(22,27,33,0.97) 60%, rgba(16,20,24,0.98) 100%)",
              boxShadow: "inset 0 1px 0 rgba(231,235,238,0.18), 0 -18px 40px rgba(0,0,0,0.45)",
            }}
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
                    className="fixed inset-0 -z-10 cursor-default bg-deck/60 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    className="absolute bottom-full left-4 mb-2 w-[min(88vw,300px)] overflow-hidden rounded-2xl border border-white/[0.12] md:left-8"
                    style={{
                      background: "linear-gradient(180deg, rgba(33,40,48,0.98), rgba(20,25,30,0.98))",
                      boxShadow: "inset 0 1px 0 rgba(231,235,238,0.16), 0 22px 60px rgba(0,0,0,0.7)",
                    }}
                  >
                    <p className="truncate border-b border-white/[0.08] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.24em] text-ink/40">
                      {current.artist}
                    </p>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        openVisualizer();
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sony/20 text-sony">
                        <Sparkles size={15} />
                      </span>
                      <span className="text-[13px] font-medium text-ink">Visualise</span>
                    </button>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        // ReleaseGrid owns the detail sheet. A track display's
                        // id is `${albumId}#${n}` — strip the track suffix so
                        // this opens the ALBUM, not the track as a release.
                        const albumId = current.id.split("#")[0];
                        const target =
                          albumId !== current.id
                            ? { ...current, id: albumId }
                            : current;
                        window.dispatchEvent(
                          new CustomEvent("pulsar-open-release", { detail: target })
                        );
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-tps/20 text-tps">
                        <ListMusic size={15} />
                      </span>
                      <span className="text-[13px] font-medium text-ink">Full album</span>
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
                      <span className="truncate text-[13px] font-medium text-ink">
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
              <div className="absolute top-2 left-0 right-0 h-1 rounded-full bg-deck shadow-[inset_0_1px_2px_rgba(0,0,0,0.85)]" />
              <div
                className={`absolute top-2 left-0 h-1 rounded-full bg-transport ${
                  scrubbing ? "" : "transition-[width]"
                }`}
                style={{ width: `${shownProgress * 100}%` }}
              />
              {/* thumb — appears on hover, always visible while dragging */}
              <span
                className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-chrome-500 bg-gradient-to-b from-chrome-100 to-chrome-300 shadow-key transition-opacity ${
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
                  {/* The only thing in Pulsar that moves in time with what's
                      playing. Sits over the artwork's foot so it reads as part
                      of the record rather than as another control. */}
                  {playing && (
                    <span className="pointer-events-none absolute inset-x-1 bottom-1 h-3 sm:hidden">
                      <LevelMeter
                        playing={playing}
                        getAnalyser={getAnalyser}
                        bars={5}
                        className="h-full w-full text-lcd drop-shadow-[0_0_6px_rgba(126,217,174,0.6)]"
                      />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-deck/55 opacity-0 transition-opacity group-hover:opacity-100">
                    <ChevronUp size={16} className="text-white" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold uppercase tracking-wide text-ink">
                    {current.title}
                  </span>
                  <span className="block truncate text-[11px] text-ink/50">{current.artist}</span>
                </span>
              </button>

              {/* The LCD. Time and level in one readout, the way a deck shows
                  them. It replaces two things: a grey timestamp, and a four-bar
                  "equaliser" that looped the same keyframes whatever was playing
                  — decoration dressed as a measurement, sitting beside a real
                  meter that already existed. The ladder here is that real meter. */}
              <span
                className="hidden flex-shrink-0 items-center gap-2.5 rounded-md border border-black/60 px-2.5 py-1.5 sm:flex"
                style={{
                  background: "linear-gradient(180deg, #0b1410 0%, #0e1a14 100%)",
                  boxShadow: "inset 0 1px 3px rgba(0,0,0,0.9), 0 1px 0 rgba(231,235,238,0.08)",
                }}
              >
                <span
                  className="font-mono text-[12px] tabular-nums tracking-wider text-lcd"
                  style={{ textShadow: "0 0 6px rgba(126,217,174,0.55)" }}
                >
                  {/* With no length known there is no tape loaded: a deck shows
                      dashes, not a confident "0:00 / 0:00" that reads as a
                      zero-second track. */}
                  {duration > 0 ? fmt(scrubbing ? shownProgress * duration : elapsed) : "-:--"}
                  <span className="text-lcd/35"> / </span>
                  <span className="text-lcd/70">{duration > 0 ? fmt(duration) : "-:--"}</span>
                </span>
                <LevelMeter
                  playing={playing && !scrubbing}
                  getAnalyser={getAnalyser}
                  bars={7}
                  segments={6}
                  className="h-5 w-11"
                />
              </span>

              {/* add to crate — brown crate glyph */}
              <button
                onClick={() => current && window.dispatchEvent(new CustomEvent("pulsar-crate-picker", { detail: current }))}
                aria-label="Add to a crate"
                title={inCrate ? "In a crate" : "Add to a crate"}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border shadow-key transition-[box-shadow,transform,background-color] active:translate-y-px active:shadow-keyed ${
                  inCrate
                    ? "border-[#c08a4e]/60 bg-[#c08a4e]/20"
                    : "border-chrome-700/70 bg-deck-600 hover:bg-[#2c353f]"
                }`}
              >
                <CrateIcon
                  size={17}
                  filled={inCrate}
                  className={inCrate ? "text-[#c08a4e]" : "text-ink/60"}
                />
              </button>

              {/* play / pause */}
              <button
                onClick={toggle}
                disabled={!hasAudio && !loading}
                aria-label={playing ? "Pause" : "Play"}
                // The one orange key. On a TPS-L2 the transport buttons were
                // the only coloured thing on a silver-and-blue body, which is
                // exactly the job this has: the single action the bar exists for.
                // It travels a pixel and loses its bezel shadow when pressed.
                // Disabled, it becomes an unlit grey key rather than a faded
                // orange one: orange at 40% over graphite reads as dirt, not as
                // "unavailable".
                className="flex h-12 w-14 flex-shrink-0 items-center justify-center rounded-[12px] border border-[#b84516] bg-transport shadow-key transition-[box-shadow,transform,filter] hover:brightness-110 active:translate-y-px active:shadow-keyed disabled:border-chrome-700/60 disabled:bg-deck-600 disabled:bg-none disabled:hover:brightness-100 [&:disabled_svg]:text-ink-600"
              >
                {loading ? (
                  <Loader2 size={20} className="animate-spin text-deck" />
                ) : playing ? (
                  <Pause size={20} className="text-deck" fill="currentColor" />
                ) : (
                  <Play size={20} className="ml-0.5 text-deck" fill="currentColor" />
                )}
              </button>

              {/* expand → visualizer. Hidden on the narrowest screens: it's
                  reachable from the track menu, and four buttons crush the
                  title on a small phone. */}
              <button
                onClick={openVisualizer}
                aria-label="Open visualizer"
                className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border border-chrome-700/70 bg-deck-600 text-ink-400 shadow-key transition-[box-shadow,transform,color] hover:text-ink active:translate-y-px active:shadow-keyed sm:flex"
              >
                <Maximize2 size={16} />
              </button>

              {/* close — kept last and visually quietest so it's never mistaken
                  for a transport control */}
              <button
                onClick={stop}
                aria-label="Close player"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] text-ink-600 transition-colors hover:bg-deck-600 hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>

            {/* Status line. The message is kept purely descriptive in
                PlayerProvider and the retry affordance lives here, so the two
                can't read as "…tap play to retry. — tap to retry". Tracking is
                tight enough and the message truncates, because 0.25em on a full
                sentence overran both edges of a 390px phone. */}
            {error && !loading && (
              <button
                onClick={() => current && play(current)}
                className="mx-auto flex max-w-full items-center justify-center gap-2 px-4 pb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-sport/70 transition-colors hover:text-sport"
              >
                <span className="truncate">{error}</span>
                <span className="flex-shrink-0 rounded-full border border-sport/40 px-2 py-0.5 text-sport">
                  Retry
                </span>
              </button>
            )}
            {!hasAudio && !loading && !error && (
              <p className="truncate px-4 pb-1.5 text-center text-[9px] font-bold uppercase tracking-[0.16em] text-sport/60">
                No preview available
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Visualizer release={expanded} onClose={() => setExpanded(null)} />
    </>
  );
}
