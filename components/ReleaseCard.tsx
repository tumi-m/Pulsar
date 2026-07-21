"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Release } from "@/lib/types";
import { isToday, isYesterday } from "@/lib/utils";
import { Artwork } from "./Artwork";

interface ReleaseCardProps {
  release: Release;
  index: number;
  featured?: boolean;
  onOpen: (release: Release) => void;
}

/**
 * Cosmos-style tile: pure artwork, edge-to-edge. On hover the image dims
 * and the essentials fade in. Click opens the Listen panel.
 */
export function ReleaseCard({ release, index, featured = false, onOpen }: ReleaseCardProps) {
  const [hovered, setHovered] = useState(false);

  const isFresh = isToday(release.release_date) || isYesterday(release.release_date);

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
        ${featured ? "col-span-2 row-span-2" : ""}
      `}
    >
      <div className="relative aspect-square w-full">
        <Artwork
          src={release.artwork_url}
          artist={release.artist}
          title={release.title}
          sizes={featured ? "(max-width: 640px) 100vw, 40vw" : undefined}
          className={`object-cover transition-all duration-500 ${
            hovered ? "scale-[1.03] brightness-[0.45]" : "scale-100"
          }`}
        />

        {/* fresh-drop dot */}
        {isFresh && !hovered && (
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-star-white shadow-[0_0_10px_rgba(232,232,244,0.9)]" />
        )}

        {/* hover veil — essentials only, cosmos-minimal */}
        <div
          className={`
            absolute inset-0 flex flex-col justify-end p-3.5 text-left
            transition-opacity duration-300
            ${hovered ? "opacity-100" : "opacity-0"}
          `}
        >
          <p className={`font-medium leading-snug text-star-white ${featured ? "text-xl" : "text-sm"} line-clamp-2`}>
            {release.title}
          </p>
          <p className={`mt-0.5 text-star-white/60 ${featured ? "text-sm" : "text-xs"} truncate`}>
            {release.artist}
          </p>
          {release.genre && (
            <p className="mt-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-star-white/40 truncate">
              {release.genre}
            </p>
          )}
          <span
            className={`
              mt-3 inline-flex w-fit items-center gap-1.5 rounded-full
              border border-star-white/25 bg-void/40 px-3 py-1
              text-[10px] font-mono uppercase tracking-widest text-star-white/90
              backdrop-blur-sm
            `}
          >
            Listen
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
              <path d="M3 1.5v9l7-4.5-7-4.5z" />
            </svg>
          </span>
        </div>
      </div>
    </motion.button>
  );
}
