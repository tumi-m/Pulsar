"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Heart, Plus, Check, Play, Pause, Share2 } from "lucide-react";
import type { Release } from "@/lib/types";
import { isToday, isYesterday } from "@/lib/utils";
import type { MediaFormat } from "@/lib/format";
import { PhysicalMedia } from "./PhysicalMedia";
import { Artwork } from "./Artwork";
import { PLATFORMS } from "./platforms";
import { isFavorite, toggleFavorite, inPlaylist, togglePlaylist } from "@/lib/collection";
import { usePlayer } from "./player/PlayerProvider";

interface ReleaseCardProps {
  release: Release;
  index: number;
  size?: 0 | 1 | 2;
  forYou?: boolean;
  format: MediaFormat;
  onOpen: (release: Release) => void;
  onVisualize?: (release: Release) => void;
}

export function ReleaseCard({ release, index, size = 0, forYou = false, format, onOpen, onVisualize }: ReleaseCardProps) {
  const player = usePlayer();
  const isCurrent = player.current?.id === release.id;
  const isPlayingThis = isCurrent && player.playing;
  const [hovered, setHovered] = useState(false);
  // `armed` gates the physical-media animation: it only turns on after the
  // cursor has rested on the tile for 3 seconds, so the grid stays calm.
  const [armed, setArmed] = useState(false);
  // DSP links reveal faster (1.5s) than the physical-media animation (3s).
  const [showDsp, setShowDsp] = useState(false);
  const [fav, setFav] = useState(false);
  const [inList, setInList] = useState(false);
  const [artHidden, setArtHidden] = useState(false); // hide if no art resolves
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dspTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFav(isFavorite(release.id));
    setInList(inPlaylist(release.id));
  }, [release.id]);

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
        duration: 0.5,
        delay: Math.min((index % 12) * 0.04, 0.5),
        ease: [0.22, 1, 0.36, 1],
      }}
      onHoverStart={enter}
      onHoverEnd={leave}
      className={`group relative ${size === 2 ? "col-span-2 row-span-2" : size === 1 ? "col-span-2" : ""}`}
    >
      <button
        type="button"
        onClick={() => {
          // Tapping anywhere OUTSIDE the play triangle enters album + visualiser.
          player.play(release);
          onOpen(release);
          onVisualize?.(release);
        }}
        onFocus={enter}
        onBlur={leave}
        aria-label={`${release.artist} — ${release.title}. Open album & visualizer`}
        className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-star-white/40"
      >
        <div
          className={`relative w-full overflow-hidden rounded-2xl ring-1 ring-star-white/[0.06] ${
            size === 1 ? "aspect-[2/1]" : "aspect-square"
          } ${size > 0 ? "tile-float" : ""}`}
          style={size > 0 ? { animationDelay: `${(index % 5) * 0.8}s` } : undefined}
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

          {/* fresh-drop dot */}
          {isFresh && !armed && (
            <span className="absolute right-1 top-1 z-10 h-2 w-2 rounded-full bg-star-white shadow-[0_0_10px_rgba(232,232,244,0.9)]" />
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
        } ${isCurrent || hovered ? "scale-100 opacity-100" : "scale-90 opacity-0"}`}
        style={{
          background: "rgba(255,255,255,0.14)",
          backdropFilter: "blur(10px) saturate(140%)",
          WebkitBackdropFilter: "blur(10px) saturate(140%)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.25)",
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
        className={`absolute inset-x-2 top-2 z-20 flex items-stretch overflow-hidden rounded-full ring-1 ring-white/40 transition-all duration-200 ${
          hovered ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"
        }`}
        style={{
          background: "rgba(255,255,255,0.14)",
          backdropFilter: "blur(10px) saturate(140%)",
          WebkitBackdropFilter: "blur(10px) saturate(140%)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.25)",
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
          className={`flex flex-1 items-center justify-center transition-colors hover:bg-white/10 ${big ? "h-12" : "h-10"}`}
        >
          <Share2 size={big ? 20 : 17} className="text-white drop-shadow" />
        </button>
        <span className="my-2 w-px bg-white/25" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setFav(toggleFavorite(release));
          }}
          aria-label={fav ? "Remove from favorites" : "Add to favorites"}
          className={`flex flex-1 items-center justify-center transition-colors hover:bg-white/10 ${big ? "h-12" : "h-10"}`}
        >
          <Heart size={big ? 22 : 19} className={fav ? "fill-neon-pink text-neon-pink" : "text-white drop-shadow"} />
        </button>
        <span className="my-2 w-px bg-white/25" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setInList(togglePlaylist(release));
          }}
          aria-label={inList ? "Remove from crate" : "Add to crate"}
          className={`flex flex-1 items-center justify-center transition-colors hover:bg-white/10 ${big ? "h-12" : "h-10"}`}
        >
          {inList ? (
            <Check size={big ? 22 : 19} className="text-neon-green drop-shadow" />
          ) : (
            <Plus size={big ? 22 : 19} className="text-white drop-shadow" />
          )}
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
            background: "linear-gradient(0deg, rgba(4,4,10,0.92), rgba(4,4,10,0.55) 70%, transparent)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
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
