"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Plus, Check } from "lucide-react";
import type { Release } from "@/lib/types";
import { isToday, isYesterday } from "@/lib/utils";
import type { MediaFormat } from "@/lib/format";
import { PhysicalMedia } from "./PhysicalMedia";
import { isFavorite, toggleFavorite, inPlaylist, togglePlaylist } from "@/lib/collection";

interface ReleaseCardProps {
  release: Release;
  index: number;
  size?: 0 | 1 | 2;
  forYou?: boolean;
  format: MediaFormat;
  onOpen: (release: Release) => void;
}

export function ReleaseCard({ release, index, size = 0, forYou = false, format, onOpen }: ReleaseCardProps) {
  const [hovered, setHovered] = useState(false);
  const [fav, setFav] = useState(false);
  const [inList, setInList] = useState(false);

  useEffect(() => {
    setFav(isFavorite(release.id));
    setInList(inPlaylist(release.id));
  }, [release.id]);

  const isFresh = isToday(release.release_date) || isYesterday(release.release_date);
  const big = size === 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: Math.min((index % 12) * 0.04, 0.5),
        ease: [0.22, 1, 0.36, 1],
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className={`group relative ${size === 2 ? "col-span-2 row-span-2" : size === 1 ? "col-span-2" : ""}`}
    >
      <button
        type="button"
        onClick={() => onOpen(release)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-label={`${release.artist} — ${release.title}. Open listen options`}
        className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-star-white/40"
      >
        <div className={`relative w-full ${size === 1 ? "aspect-[2/1]" : "aspect-square"}`}>
          <PhysicalMedia
            src={release.artwork_url}
            artist={release.artist}
            title={release.title}
            format={format}
            hovered={hovered}
            big={big}
          />

          {/* fresh-drop dot */}
          {isFresh && !hovered && (
            <span className="absolute right-1 top-1 z-10 h-2 w-2 rounded-full bg-star-white shadow-[0_0_10px_rgba(232,232,244,0.9)]" />
          )}

          {/* taste badge */}
          {forYou && size > 0 && !hovered && (
            <span className="absolute left-1 top-1 z-10 border border-white/50 bg-void/50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
              “FOR YOU”
            </span>
          )}

          {/* hover caption */}
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col p-2.5 text-left transition-opacity duration-300 ${
              hovered ? "opacity-100" : "opacity-0"
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

      {/* quick actions — appear on hover, top-right */}
      <div
        className={`absolute right-1.5 top-1.5 z-20 flex gap-1 transition-all duration-200 ${
          hovered ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setFav(toggleFavorite(release));
          }}
          aria-label={fav ? "Remove from favorites" : "Add to favorites"}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-void/70 backdrop-blur-sm transition-colors hover:border-white/60"
        >
          <Heart size={12} className={fav ? "fill-neon-pink text-neon-pink" : "text-star-white/80"} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setInList(togglePlaylist(release));
          }}
          aria-label={inList ? "Remove from playlist" : "Add to playlist"}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-void/70 backdrop-blur-sm transition-colors hover:border-white/60"
        >
          {inList ? (
            <Check size={12} className="text-neon-green" />
          ) : (
            <Plus size={12} className="text-star-white/80" />
          )}
        </button>
      </div>
    </motion.div>
  );
}
