"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Release } from "@/lib/types";
import { MOOD_COLORS, MOOD_LABELS, formatDate, isToday, isYesterday } from "@/lib/utils";
import { PlatformLinks } from "./PlatformLinks";
import { Artwork } from "./Artwork";

interface ReleaseCardProps {
  release: Release;
  index: number;
  onOpen: (release: Release) => void;
}

export function ReleaseCard({ release, index, onOpen }: ReleaseCardProps) {
  const [hovered, setHovered] = useState(false);

  const mood = release.mood ?? "ambient";
  const moodStyle = MOOD_COLORS[mood] ?? MOOD_COLORS.ambient;

  const dateLabel = isToday(release.release_date)
    ? "TODAY"
    : isYesterday(release.release_date)
    ? "YESTERDAY"
    : formatDate(release.release_date).toUpperCase();

  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: Math.min(index * 0.08, 0.8),
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => onOpen(release)}
      className="group relative cursor-pointer select-none"
    >
      {/* Floating glow on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className={`absolute -inset-4 rounded-2xl pointer-events-none blur-xl ${moodStyle.bg} z-0`}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10">
        {/* Artwork */}
        <motion.div
          animate={hovered ? { scale: 1.02, y: -6 } : { scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative aspect-square w-full overflow-hidden rounded-xl"
          style={{
            boxShadow: hovered
              ? `0 30px 80px rgba(0,0,0,0.8), 0 0 40px ${moodStyle.bg.replace("bg-", "rgba(").replace("/10", ", 0.3)")}`
              : "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <Artwork
            src={release.artwork_url}
            artist={release.artist}
            title={release.title}
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />

          {/* Scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-5"
            style={{
              background:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
            }}
          />

          {/* Date badge */}
          <div className="absolute top-3 left-3">
            <span
              className={`
                text-[10px] font-mono font-bold tracking-widest
                px-2 py-0.5 rounded-full border backdrop-blur-sm
                ${moodStyle.text} ${moodStyle.bg} border-current/20
              `}
            >
              {dateLabel}
            </span>
          </div>

          {/* Type badge */}
          <div className="absolute top-3 right-3">
            <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full bg-void/70 text-dust border border-mist/30 backdrop-blur-sm">
              {release.type.toUpperCase()}
            </span>
          </div>

          {/* Hover overlay — platform links */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-void/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4"
              >
                <p className="text-xs text-dust font-mono tracking-widest uppercase mb-1">
                  Listen on
                </p>
                <PlatformLinks release={release} variant="card" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Info */}
        <div className="mt-3 space-y-1 px-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-star-white font-medium text-sm leading-tight truncate">
                {release.title}
              </p>
              <p className="text-dust text-xs mt-0.5 truncate">{release.artist}</p>
            </div>
            {release.mood && (
              <span
                className={`flex-shrink-0 text-[9px] font-mono font-bold tracking-wider ${moodStyle.text}`}
              >
                {MOOD_LABELS[release.mood]}
              </span>
            )}
          </div>

          {release.curator_note && (
            <motion.p
              animate={hovered ? { opacity: 1 } : { opacity: 0.5 }}
              className="text-[11px] text-dust/70 leading-relaxed line-clamp-2 italic"
            >
              {release.curator_note}
            </motion.p>
          )}

          {release.genre && (
            <p className="text-[10px] font-mono text-mist tracking-wide">
              {release.genre}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}
