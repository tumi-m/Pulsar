"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Link as LinkIcon, Play, Pause, ChevronLeft, ChevronRight, Maximize2, Share2 } from "lucide-react";
import type { Release } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Artwork } from "./Artwork";
import { PLATFORMS } from "./platforms";
import { usePlayer } from "./player/PlayerProvider";
import { VisualCanvas, VISUAL_MODES, type VisualMode } from "./VisualCanvas";

interface Track {
  number: number;
  title: string;
  durationMs: number;
  previewUrl: string | null;
}

interface ReleaseDetailProps {
  release: Release | null;
  onClose: () => void;
  onOpen?: (release: Release) => void;
  onVisualize?: (release: Release) => void;
}

const fmtDur = (ms: number) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Half-page detail — a right-side sheet. For an album (or EP) it fetches
 * and shows the whole tracklist; each track plays its own 30s preview.
 */
export function ReleaseDetail({ release, onClose, onOpen, onVisualize }: ReleaseDetailProps) {
  const player = usePlayer();
  const [copied, setCopied] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(true);
  const [origDate, setOrigDate] = useState<string | null>(null);
  const [visualMode, setVisualMode] = useState<VisualMode>("nebula");
  // The visualiser stays OFF until the user taps the Visualise button.
  const [showVisual, setShowVisual] = useState(false);
  useEffect(() => setShowVisual(false), [release]);
  // Artist discography (crate-style grid), fetched on demand.
  const [discog, setDiscog] = useState<Release[] | null>(null);
  const [discogLoading, setDiscogLoading] = useState(false);
  useEffect(() => setDiscog(null), [release]);

  async function openDiscography() {
    if (!release) return;
    setDiscogLoading(true);
    setDiscog([]);
    try {
      const res = await fetch(`/api/artist?name=${encodeURIComponent(release.artist)}`);
      const data = await res.json();
      setDiscog(Array.isArray(data.releases) ? data.releases : []);
    } catch {
      setDiscog([]);
    } finally {
      setDiscogLoading(false);
    }
  }

  // For a single: jump to the parent project's full tracklist (if there is one).
  const [parentLoading, setParentLoading] = useState(false);
  async function openParentProject() {
    if (!release || !onOpen) return;
    setParentLoading(true);
    try {
      const res = await fetch(
        `/api/parent?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}`
      );
      const data = await res.json();
      if (data.album?.title) {
        onOpen({
          ...release,
          id: `album-${release.id}`,
          title: data.album.title,
          type: "album",
          artwork_url: data.album.artwork ?? release.artwork_url,
        });
      }
    } catch {
      /* no parent found */
    } finally {
      setParentLoading(false);
    }
  }

  const cycleVisual = (dir: 1 | -1) =>
    setVisualMode((m) => {
      const i = VISUAL_MODES.findIndex((x) => x.id === m);
      return VISUAL_MODES[(i + dir + VISUAL_MODES.length) % VISUAL_MODES.length].id;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch the whole album's tracklist + original release date when selected.
  useEffect(() => {
    setTracks(null);
    setOrigDate(null);
    if (!release || (release.type !== "album" && release.type !== "ep")) return;
    let cancelled = false;
    setTracksLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/album?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}`
        );
        const data = await res.json();
        if (cancelled) return;
        setTracks(Array.isArray(data.tracks) ? data.tracks : []);
        if (typeof data.releaseDate === "string") setOrigDate(data.releaseDate);
      } catch {
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setTracksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [release]);

  const available = release ? PLATFORMS.filter((p) => Boolean(release[p.key])) : [];

  async function copyLink(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function shareRelease() {
    if (!release) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const data = { title: `${release.title} — ${release.artist}`, text: "Found on PULSAR", url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setCopied("share");
        setTimeout(() => setCopied(null), 1600);
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <AnimatePresence>
      {release && (
        <>
          {/* dim only the LEFT (grid) half on small screens; on lg the grid
              reflows so we keep a very light scrim just for focus */}
          <motion.button
            aria-label="Close detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 cursor-default bg-void/60 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-0"
          />

          <motion.aside
            key={release.id}
            initial={{ y: "100%", x: 0 }}
            animate={{ y: 0, x: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 520, damping: 42 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-40 flex h-[72vh] transform-gpu touch-pan-y flex-col rounded-t-2xl border border-b-0 border-white/15 bg-[#0a0a14]/70 backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-16 lg:bottom-3 lg:h-auto lg:w-1/2 lg:rounded-l-2xl lg:border lg:border-r-0"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 -20px 60px rgba(0,0,0,0.5)" }}
            role="dialog"
            aria-modal="false"
            aria-label={`${release.title} by ${release.artist}`}
          >
            {/* mobile grab handle */}
            <div className="mx-auto mt-2 h-1 w-10 flex-shrink-0 rounded-full bg-star-white/25 lg:hidden" />
            {/* translucent liquid-glass title bar */}
            <div
              className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2"
              style={{
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(12px) saturate(150%)",
                WebkitBackdropFilter: "blur(12px) saturate(150%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            >
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-star-white/80">
                Album
                <span className="text-star-white/25">·</span>
                <span className="max-w-[46vw] truncate normal-case tracking-tight text-star-white lg:max-w-[16vw]">
                  {release.title}
                </span>
              </span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/25 text-star-white/80 transition-colors hover:border-white/60 hover:text-star-white"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            {/* header row — artwork, meta */}
            <div className="flex items-start gap-4 border-b border-star-white/5 p-5">
              <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg">
                <Artwork src={release.artwork_url} artist={release.artist} title={release.title} sizes="96px" />
              </div>
              <div className="min-w-0 flex-1 pt-1">
                {release.type === "single" && onOpen ? (
                  <button
                    onClick={openParentProject}
                    disabled={parentLoading}
                    title="Open the full project"
                    className="text-left text-lg font-bold uppercase leading-tight tracking-tight text-star-white underline decoration-star-white/25 underline-offset-[3px] transition-colors hover:decoration-star-white/60 disabled:opacity-60"
                  >
                    {release.title}
                    {parentLoading && <span className="ml-2 text-[10px] text-star-white/40">…</span>}
                  </button>
                ) : (
                  <h2 className="text-lg font-bold uppercase leading-tight tracking-tight text-star-white">
                    {release.title}
                  </h2>
                )}
                <button
                  onClick={openDiscography}
                  className="mt-0.5 text-left text-sm text-star-white/65 underline decoration-star-white/25 underline-offset-[3px] transition-colors hover:text-star-white hover:decoration-star-white/50"
                  title={`See ${release.artist}'s discography`}
                >
                  {release.artist}
                </button>
                <p className="mt-2 text-[10px] font-mono uppercase tracking-[0.18em] text-star-white/35">
                  {release.type} · {formatDate(origDate ?? release.release_date)}
                  {release.genre ? ` · ${release.genre}` : ""}
                </p>
                {/* DSP platform logos next to the artist / release date */}
                {available.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {available.map((p) => (
                      <a
                        key={p.key}
                        href={release[p.key]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={p.hint}
                        title={p.label}
                        className="flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110"
                        style={{ backgroundColor: `${p.color}26`, color: p.color }}
                      >
                        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">
                          <p.Icon />
                        </span>
                      </a>
                    ))}
                  </div>
                )}
                {release.label && (
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-neon-green/70">
                    ▪ {release.label}
                  </p>
                )}
              </div>
            </div>

            {/* scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {release.curator_note && (
                <p className="border-b border-star-white/5 px-5 py-4 text-sm italic leading-relaxed text-star-white/60">
                  {release.curator_note}
                </p>
              )}

              {/* visualiser — sits ABOVE the tracklist (above the first track).
                  OFF by default; only shown once the user taps Visualise. */}
              {onVisualize && (
                <div className="border-b border-star-white/5 p-3">
                  {!showVisual ? (
                    <button
                      onClick={() => {
                        player.play(release);
                        player.ensureGraph(); // desktop: build analyser in-gesture
                        setShowVisual(true);
                      }}
                      className="group relative flex w-full items-center justify-center gap-4 overflow-hidden rounded-2xl px-5 py-[22px] transition-transform hover:-translate-y-0.5 active:translate-y-0"
                      style={{
                        background: "linear-gradient(150deg, #1d1d24 0%, #0a0a0e 100%)",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -3px 12px rgba(0,0,0,0.6), 0 16px 36px rgba(0,0,0,0.68)",
                      }}
                    >
                      {/* Nothing-style dot-matrix texture */}
                      <span
                        className="pointer-events-none absolute inset-0 opacity-[0.16]"
                        style={{
                          backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1.4px)",
                          backgroundSize: "9px 9px",
                        }}
                      />
                      {/* hover aurora glow */}
                      <span
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                        style={{ background: "radial-gradient(130% 130% at 50% 130%, rgba(155,93,229,0.4), rgba(0,212,255,0.12) 45%, transparent 65%)" }}
                      />
                      {/* live light sweep */}
                      <motion.span
                        className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent)" }}
                        animate={{ x: ["-60%", "360%"] }}
                        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                      />
                      {/* animated equalizer icon */}
                      <span
                        className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-white/25 transition-transform group-hover:scale-105"
                        style={{ background: "linear-gradient(140deg, rgba(155,93,229,0.55), rgba(0,212,255,0.3))" }}
                      >
                        <span className="flex items-end gap-[3px]" aria-hidden>
                          {[0, 1, 2, 3].map((i) => (
                            <motion.span
                              key={i}
                              className="w-[3px] rounded-full bg-white"
                              animate={{ height: [6, 17, 9, 19, 6] }}
                              transition={{ duration: 0.95, repeat: Infinity, delay: i * 0.13, ease: "easeInOut" }}
                            />
                          ))}
                        </span>
                      </span>
                      {/* label */}
                      <span className="relative flex flex-col items-start leading-none">
                        <span className="text-xl font-black uppercase tracking-[0.22em] text-white">Visualise</span>
                        <span className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.28em] text-white/40">
                          Live audio-reactive
                        </span>
                      </span>
                      {/* Nothing signature red accent dot — pulsing */}
                      <motion.span
                        className="absolute right-5 h-2.5 w-2.5 rounded-full bg-[#ff2d20]"
                        animate={{ opacity: [1, 0.45, 1], scale: [1, 0.85, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                        style={{ boxShadow: "0 0 12px #ff2d20" }}
                      />
                    </button>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-star-white/35">
                          Visualise
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              onVisualize(release);
                              onClose(); // leave tracklist → full-screen visual
                            }}
                            aria-label="Expand visualiser"
                            title="Expand"
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 text-star-white/70 transition-colors hover:border-white/50 hover:text-star-white"
                          >
                            <Maximize2 size={12} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => setShowVisual(false)}
                            aria-label="Hide visualiser"
                            title="Hide"
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 text-star-white/70 transition-colors hover:border-white/50 hover:text-star-white"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                      <div
                        className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/12"
                        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 30px rgba(0,0,0,0.5)" }}
                      >
                        <VisualCanvas release={release} mode={visualMode} className="absolute inset-0 h-full w-full" />
                        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1 p-2">
                          <div
                            className="flex items-center gap-1 rounded-full border border-white/15 p-1"
                            style={{
                              background: "rgba(255,255,255,0.1)",
                              backdropFilter: "blur(12px) saturate(150%)",
                              WebkitBackdropFilter: "blur(12px) saturate(150%)",
                            }}
                          >
                            <button
                              onClick={() => cycleVisual(-1)}
                              aria-label="Previous visualisation"
                              className="flex h-6 w-6 items-center justify-center rounded-full text-star-white/70 hover:bg-white/10 hover:text-star-white"
                            >
                              <ChevronLeft size={15} />
                            </button>
                            <span className="min-w-[64px] text-center text-[10px] font-bold uppercase tracking-[0.14em] text-star-white">
                              {VISUAL_MODES.find((m) => m.id === visualMode)?.label}
                            </span>
                            <button
                              onClick={() => cycleVisual(1)}
                              aria-label="Next visualisation"
                              className="flex h-6 w-6 items-center justify-center rounded-full text-star-white/70 hover:bg-white/10 hover:text-star-white"
                            >
                              <ChevronRight size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* whole-album tracklist (albums / EPs) — collapsible */}
              {(release.type === "album" || release.type === "ep") && (
                <div className="border-b border-star-white/5 p-3">
                  <button
                    onClick={() => setTracksOpen((v) => !v)}
                    aria-expanded={tracksOpen}
                    className="flex w-full items-center justify-between px-2 pb-2 pt-1 text-[10px] font-mono uppercase tracking-[0.22em] text-star-white/35 transition-colors hover:text-star-white/60"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`transition-transform ${tracksOpen ? "rotate-90" : ""}`}>›</span>
                      Tracklist
                    </span>
                    {tracks && tracks.length > 0 && <span>{tracks.length} tracks</span>}
                  </button>
                  {tracksLoading && (
                    <p className="px-2 py-3 text-[11px] text-star-white/30">Loading tracks…</p>
                  )}
                  {!tracksLoading && tracks && tracks.length === 0 && (
                    <p className="px-2 py-3 text-[11px] text-star-white/30">
                      Tracklist unavailable for this release.
                    </p>
                  )}
                  <AnimatePresence initial={false}>
                    {tracksOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1">
                          {(tracks ?? []).map((t) => {
                            const trackDisplay: Release = { ...release, title: t.title };
                            const isThis =
                              player.current?.artist === release.artist && player.current?.title === t.title;
                            const playingThis = isThis && player.playing;
                            return (
                              <div
                                key={`${t.number}-${t.title}`}
                                className={`group flex items-center gap-3 rounded-xl border px-2.5 py-1.5 backdrop-blur-md transition-colors ${
                                  isThis
                                    ? "border-neon-blue/30 bg-neon-blue/[0.10]"
                                    : "border-white/10 bg-white/[0.05] hover:bg-white/[0.09]"
                                }`}
                              >
                                <button
                                  onClick={() => {
                                    if (isThis) player.toggle();
                                    else if (t.previewUrl) player.playDirect(trackDisplay, t.previewUrl);
                                  }}
                                  disabled={!t.previewUrl}
                                  aria-label={playingThis ? "Pause" : "Play track"}
                                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-star-white/45 transition-colors group-hover:text-star-white disabled:opacity-30"
                                >
                                  <span className="group-hover:hidden">
                                    {playingThis ? (
                                      <Pause size={12} className="text-neon-blue" fill="currentColor" />
                                    ) : (
                                      <span className="text-[11px] font-mono">{t.number || "•"}</span>
                                    )}
                                  </span>
                                  <span className="hidden group-hover:inline">
                                    {playingThis ? (
                                      <Pause size={12} fill="currentColor" />
                                    ) : (
                                      <Play size={12} fill="currentColor" />
                                    )}
                                  </span>
                                </button>
                                <span
                                  className={`flex-1 truncate text-[13px] ${
                                    isThis ? "text-neon-blue" : "text-star-white/85"
                                  }`}
                                >
                                  {t.title}
                                </span>
                                <span className="flex-shrink-0 font-mono text-[10px] text-star-white/30">
                                  {fmtDur(t.durationMs)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="p-3">
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-star-white/35">
                    Listen on your service
                  </p>
                  <button
                    onClick={shareRelease}
                    aria-label="Share"
                    className="flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-star-white/75 transition-colors hover:border-white/50 hover:text-star-white"
                  >
                    {copied === "share" ? (
                      <Check size={12} className="text-neon-green" />
                    ) : (
                      <Share2 size={12} />
                    )}
                    Share
                  </button>
                </div>
                <div className="space-y-1">
                  {available.map((p, i) => (
                    <motion.div
                      key={p.key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + i * 0.05, duration: 0.3 }}
                      className="group flex items-stretch gap-1"
                    >
                      <a
                        href={release[p.key]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-star-white/[0.06]"
                      >
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${p.color}1f`, color: p.color }}
                        >
                          <p.Icon />
                        </span>
                        <span className="flex-1 text-sm font-medium text-star-white">{p.label}</span>
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5 text-star-white/25 transition-all group-hover:translate-x-0.5 group-hover:text-star-white/70"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M5 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                      <button
                        onClick={() => copyLink(p.key, release[p.key]!)}
                        aria-label={`Copy ${p.label} link`}
                        className="flex w-9 items-center justify-center rounded-xl text-star-white/25 transition-colors hover:bg-star-white/[0.06] hover:text-star-white/70"
                      >
                        {copied === p.key ? (
                          <Check size={14} className="text-neon-green" />
                        ) : (
                          <LinkIcon size={13} />
                        )}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>

          {/* discography — its own fixed overlay (NOT inside the draggable
              sheet, so it scrolls/taps reliably) */}
          <AnimatePresence>
            {discog !== null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 480, damping: 40 }}
                className="fixed inset-x-0 bottom-0 top-0 z-[45] flex flex-col bg-[#0a0a14]/97 backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:w-1/2"
              >
                <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                  <button
                    onClick={() => setDiscog(null)}
                    aria-label="Back"
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-star-white/75 hover:border-white/50 hover:text-star-white"
                  >
                    <span className="text-lg leading-none">‹</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-star-white/40">Discography</p>
                    <h3 className="truncate text-base font-bold uppercase tracking-tight text-star-white">
                      {release.artist}
                    </h3>
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
                  >
                    <X size={16} />
                  </button>
                </div>
                {discogLoading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2">
                    <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon-violet" />
                    <p className="text-[11px] uppercase tracking-widest text-star-white/40">Loading discography…</p>
                  </div>
                ) : discog.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center px-6 text-center text-[11px] uppercase tracking-widest text-star-white/40">
                    No discography found
                  </p>
                ) : (
                  <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto overscroll-contain p-4 sm:grid-cols-3">
                    {discog.map((r) => (
                      <button key={r.id} onClick={() => onOpen?.(r)} className="group block text-left">
                        <div className="relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-white/10 transition-transform active:scale-95 group-hover:scale-[1.03]">
                          <Artwork src={r.artwork_url} artist={r.artist} title={r.title} sizes="160px" />
                        </div>
                        <p className="mt-1 truncate text-[11px] font-bold uppercase text-star-white">{r.title}</p>
                        <p className="truncate text-[9px] uppercase tracking-wide text-star-white/45">
                          {r.type}
                          {r.release_date && r.release_date !== "1900-01-01"
                            ? ` · ${r.release_date.slice(0, 4)}`
                            : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
