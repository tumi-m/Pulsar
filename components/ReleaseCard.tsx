"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Release } from "@/lib/types";
import { isToday, isYesterday } from "@/lib/utils";
import { Artwork } from "./Artwork";

interface ReleaseCardProps {
  release: Release;
  index: number;
  /** 0 = normal, 1 = wide (2x1), 2 = favorite (2x2) */
  size?: 0 | 1 | 2;
  /** true when the size came from the user's taste profile */
  forYou?: boolean;
  onOpen: (release: Release) => void;
}

/**
 * Cosmos-style tile: pure artwork, edge-to-edge. On hover the image dims
 * and the essentials fade in. Larger tiles = the user's favorites,
 * decided by the visual taste quiz.
 */
export function ReleaseCard({ release, index, size = 0, forYou = false, onOpen }: ReleaseCardProps) {
  const [hovered, setHovered] = useState(false);

  const isFresh = isToday(release.release_date) || isYesterday(release.release_date);
  const big = size === 2;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: Math.min((index % 12) * 0.04, 0.5),
        ease: [0.22, 1, 0.36, 1],
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={() => onOpen(release)}
      aria-label={`${release.artist} — ${release.title}. Open listen options`}
      className={`
        group relative block w-full overflow-hidden rounded-xl bg-cosmos
        outline-none focus-visible:ring-2 focus-visible:ring-star-white/40
        ${size === 2 ? "col-span-2 row-span-2" : size === 1 ? "col-span-2" : ""}
      `}
    >
      <div className={`relative w-full ${size === 1 ? "aspect-[2/1]" : "aspect-square"}`}>
        <Artwork
          src={release.artwork_url}
          artist={release.artist}
          title={release.title}
          sizes={size ? "(max-width: 640px) 100vw, 40vw" : undefined}
          className={`object-cover transition-all duration-500 ${
            hovered ? "scale-[1.03] brightness-[0.45]" : "scale-100"
          }`}
        />

        {/* fresh-drop dot */}
        {isFresh && !hovered && (
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-star-white shadow-[0_0_10px_rgba(232,232,244,0.9)]" />
        )}

        {/* taste badge — Off-White quoted label */}
        {forYou && size > 0 && !hovered && (
          <span className="absolute left-2.5 top-2.5 border border-white/60 bg-void/50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
            “FOR YOU”
          </span>
        )}

        {/* hover veil — essentials only */}
        <div
          className={`
            absolute inset-0 flex flex-col justify-end p-3.5 text-left
            transition-opacity duration-300
            ${hovered ? "opacity-100" : "opacity-0"}
          `}
        >
          <p className={`font-bold uppercase leading-snug text-star-white ${big ? "text-xl" : "text-sm"} line-clamp-2`}>
            {release.title}
          </p>
          <p className={`mt-0.5 text-star-white/60 ${big ? "text-sm" : "text-xs"} truncate`}>
            {release.artist}
          </p>
          {release.genre && (
            <p className="mt-1.5 truncate text-[9px] font-mono uppercase tracking-[0.18em] text-star-white/40">
              {release.genre}
            </p>
          )}
          <span className="mt-3 inline-flex w-fit items-center gap-1.5 border border-star-white/40 bg-void/40 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-star-white backdrop-blur-sm">
            “Listen” →
          </span>
        </div>
      </div>
    </motion.button>
  );
}
