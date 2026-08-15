"use client";

import { useState, useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";
import { Heart, Play, Pause, Share2 } from "lucide-react";
import { CrateIcon } from "./CrateIcon";
import type { Release } from "@/lib/types";
import { isToday, isYesterday } from "@/lib/utils";
import type { MediaFormat } from "@/lib/format";
import { PhysicalMedia } from "./PhysicalMedia";
import { Artwork } from "./Artwork";
import { PLATFORMS } from "./platforms";
import { toggleFavorite } from "@/lib/collection";
import { useCollectionState } from "@/lib/useCollectionState";
import { usePlayer } from "./player/PlayerProvider";
import { useIsTouch } from "@/lib/useIsTouch";

interface ReleaseCardProps {
  release: Release;
  index: number;
  size?: 0 | 1 | 2;
  forYou?: boolean;
  format: MediaFormat;
  scrolling?: boolean;
  /** Tiles are too small for overlay controls (dense pinch-zoom). */
  compact?: boolean;
  onOpen: (release: Release) => void;
}

function ReleaseCardBase({ release, index, size = 0, forYou = false, format, scrolling = false, compact = false, onOpen }: ReleaseCardProps) {
  const player = usePlayer();
  const isCurrent = player.current?.id === release.id;
  const isPlayingThis = isCurrent && player.playing;
  const [hovered, setHovered] = useState(false);
  // Touch devices never fire hover, so the quick actions (share / favourite /
  // crate) and the play triangle would be permanently invisible — show them.
  const isTouch = useIsTouch();
  // Showing the action bar on every tile buried the artwork under a wall of
  // controls on mobile. On touch it now reveals for ONE tile at a time, via a
  // long press — and not at all once tiles get too small to aim at.
  const [pressRevealed, setPressRevealed] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!pressRevealed) return;
    // Any tap elsewhere dismisses it, so only one tile is ever armed.
    const dismiss = () => setPressRevealed(false);
    window.addEventListener("pointerdown", dismiss, { capture: true });
    return () => window.removeEventListener("pointerdown", dismiss, { capture: true });
  }, [pressRevealed]);

  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  const startPress = () => {
    if (!isTouch || compact) return;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setPressRevealed(true);
      suppressClick.current = true; // a long press must not also open the album
    }, 450);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  // `compact` tiles (a dense pinch-zoom) are too small for overlay controls.
  const revealed = compact ? false : hovered || pressRevealed;
  // `armed` gates the physical-media animation: it only turns on after the
  // cursor has rested on the tile for 3 seconds, so the grid stays calm.
  const [armed, setArmed] = useState(false);
  // DSP links reveal faster (1.5s) than the physical-media animation (3s).
  const [showDsp, setShowDsp] = useState(false);
  const [artHidden, setArtHidden] = useState(false); // hide if no art resolves
  // One shared listener for the whole grid instead of one per tile.
  const { fav, inList } = useCollectionState(release.id);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dspTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
    if (dspTimer.current) clearTimeout(dspTimer.current);
  }, []);

  const enter = () => {
    setHovered(true);
    if (armTimer.current) clearTimeout(armTimer.current);
    if (dspTimer.current) clearTimeout(dspTimer.current);
    dspTimer.current = setTimeout(() => setShowDsp(true), 1500); // DSP links: 1.5s
    armTimer.current = setTimeout(() => setArmed(true), 3000); // physical media: 3s
  };
  const leave = () => {
    setHovered(false);
    setArmed(false);
    setShowDsp(false);
    if (armTimer.current) clearTimeout(armTimer.current);
    if (dspTimer.current) clearTimeout(dspTimer.current);
  };

  const isFresh = isToday(release.release_date) || isYesterday(release.release_date);
  const big = size === 2;
  // DSP deep links available for this release (shown full-colour on 3s dwell).
  const dsps = PLATFORMS.filter((p) => Boolean(release[p.key]));

  // No artwork could be resolved → don't show this release at all.
  if (artHidden) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        // Only the first screenful staggers. Beyond that a tile has scrolled
        // into view and should simply be there.
        delay: index < 12 ? index * 0.035 : 0,
        ease: [0.22, 1, 0.36, 1],
      }}
      onHoverStart={enter}
      onHoverEnd={leave}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerLeave={endPress}
      whileTap={scrolling ? undefined : { scale: 0.95 }}
      className={`group relative ${size === 2 ? "col-span-2 row-span-2" : size === 1 ? "col-span-2" : ""}`}
      style={{
        contentVisibility: "auto",
        // Reserve the tile's box so skipping paint never collapses the grid or
        // makes the scrollbar jump.
        containIntrinsicSize: size === 1 ? "auto 180px" : "auto 320px",
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          // Tapping anywhere OUTSIDE the play triangle opens album mode and
          // plays — the visualiser only comes up via its own Visualise button.
          player.play(release);
          onOpen(release);
        }}
        onFocus={enter}
        onBlur={leave}
        aria-label={`${release.artist} — ${release.title}. Open album`}
        className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-star-white/40"
      >
        <div
          className={`relative w-full overflow-hidden rounded-2xl ring-1 ring-star-white/[0.06] transition-[transform,box-shadow,ring-color] duration-300 ${
            size === 1 ? "aspect-[2/1]" : "aspect-square"
          } ${size > 0 ? "tile-float" : ""} ${
            revealed ? "scale-[1.03] ring-2 ring-neon-violet/50" : ""
          }`}
          style={{
            ...(size > 0 ? { animationDelay: `${(index % 5) * 0.8}s` } : {}),
            boxShadow: revealed
              ? "0 18px 50px -12px rgba(155,93,229,0.45), 0 0 0 1px rgba(155,93,229,0.25)"
              : undefined,
          }}
        >
          {/* default: plain album cover */}
          <Artwork
            src={release.artwork_url}
            artist={release.artist}
            title={release.title}
            className={`object-cover transition-opacity duration-300 ${armed ? "opacity-0" : "opacity-100"}`}
            onUnavailable={() => setArtHidden(true)}
          />
          {/* physical object appears only after a 3-second dwell */}
          {armed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0"
            >
              <PhysicalMedia
                src={release.artwork_url}
                artist={release.artist}
                title={release.title}
                format={format}
                hovered={armed}
                big={big}
              />
            </motion.div>
          )}

          {/* fresh-drop pill — more visible than a dot */}
          {isFresh && !armed && (
            <span
              className="absolute right-1.5 top-1.5 z-10 rounded-full border border-white/40 bg-void/55 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm"
              style={{ boxShadow: "0 0 12px rgba(232,232,244,0.35)" }}
            >
              Fresh
            </span>
          )}

          {/* taste badge */}
          {forYou && size > 0 && !armed && (
            <span className="absolute left-1 top-1 z-10 border border-white/50 bg-void/50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
              FOR YOU
            </span>
          )}

          {/* caption — appears with the animation, after the 3s dwell */}
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col p-2.5 text-left transition-opacity duration-300 ${
              armed ? "opacity-100" : "opacity-0"
            }`}
          >
            <p className={`font-bold uppercase leading-tight text-star-white ${big ? "text-base" : "text-[11px]"} line-clamp-1`}>
              {release.title}
            </p>
            <p className="truncate text-[10px] text-star-white/60">{release.artist}</p>
            {release.label && (
              <p className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-[0.2em] text-neon-green/70">
                {release.label}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* liquid-glass play triangle — center. Plays + opens the visualiser. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          // The triangle ONLY plays/pauses the preview — it does not enter
          // album/visualiser mode (that's for taps outside the triangle).
          if (isCurrent) player.toggle();
          else player.play(release);
        }}
        aria-label={isPlayingThis ? "Pause" : "Play preview"}
        className={`absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-1 ring-white/40 transition-all duration-200 ${
          big ? "h-20 w-20" : "h-14 w-14"
        } ${isCurrent || revealed ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
        style={{
          background: "rgba(12,12,20,0.72)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.35)",
        }}
      >
        {isPlayingThis ? (
          <Pause size={big ? 26 : 18} className="text-white drop-shadow" fill="currentColor" />
        ) : (
          <Play size={big ? 26 : 18} className="ml-0.5 text-white drop-shadow" fill="currentColor" />
        )}
      </button>

      {/* quick actions — a full-width liquid-glass bar (matches the play
          triangle): Share · Favorite · Crate, spanning the tile's width */}
      <div
        className={`absolute inset-x-2 top-2 z-20 flex items-stretch overflow-hidden rounded-full ring-1 ring-white/45 transition-all duration-200 ${
          revealed ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"
        }`}
        style={{
          background: "rgba(12,12,20,0.72)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.35)",
        }}
      >
        <button
          onClick={async (e) => {
            e.stopPropagation();
            const url = typeof window !== "undefined" ? window.location.href : "";
            const data = { title: `${release.title} — ${release.artist}`, text: "Found on PULSAR", url };
            try {
              if (navigator.share) await navigator.share(data);
              else await navigator.clipboard.writeText(url);
            } catch {
              /* cancelled */
            }
          }}
          aria-label="Share"
          className={`flex flex-1 items-center justify-center transition-colors hover:bg-neon-blue/15 ${big ? "h-12" : "h-10"}`}
        >
          <Share2 size={big ? 20 : 17} className="text-neon-blue drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
        </button>
        <span className="my-2 w-px bg-white/25" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(release);
          }}
          aria-label={fav ? "Remove from favorites" : "Add to favorites"}
          className={`flex flex-1 items-center justify-center transition-colors hover:bg-neon-pink/15 ${big ? "h-12" : "h-10"}`}
        >
          <Heart size={big ? 22 : 19} className={`drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${fav ? "fill-neon-pink text-neon-pink" : "text-neon-pink"}`} />
        </button>
        <span className="my-2 w-px bg-white/25" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("pulsar-crate-picker", { detail: release }));
          }}
          aria-label="Add to a crate"
          className={`flex flex-1 items-center justify-center transition-colors hover:bg-[#c08a4e]/20 ${big ? "h-12" : "h-10"}`}
        >
          <CrateIcon size={big ? 22 : 19} filled={inList} className="text-[#e0a45c] drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
        </button>
      </div>

      {/* after a 1.5-second dwell: full-colour DSP logos across the bottom,
          each linking straight to this release on that service */}
      {dsps.length > 0 && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 rounded-b-2xl px-2 py-2 transition-all duration-300 ${
            showDsp ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
          style={{
            background: "linear-gradient(0deg, rgba(4,4,10,0.95), rgba(4,4,10,0.62) 70%, transparent)",
          }}
        >
          {dsps.map((p) => (
            <a
              key={p.key}
              href={release[p.key]!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={p.hint}
              title={p.label}
              className={`flex items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95 ${
                showDsp ? "pointer-events-auto" : ""
              } ${big ? "h-9 w-9" : "h-7 w-7"}`}
              style={{ backgroundColor: `${p.color}2e`, color: p.color }}
            >
              <span className={big ? "[&>svg]:h-5 [&>svg]:w-5" : "[&>svg]:h-4 [&>svg]:w-4"}>
                <p.Icon />
              </span>
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Memoised: ReleaseGrid re-renders on every scroll tick (it tracks `scrolling`
 * and `atTop`), which previously re-rendered every mounted tile with it.
 * Tiles only actually change when their own props do.
 */
export const ReleaseCard = memo(ReleaseCardBase);
