"use client";

import { motion } from "framer-motion";

interface HeroSectionProps {
  totalReleases: number;
  totalToday: number;
}

/**
 * Compact, cosmos-style intro — a quiet statement, then straight into
 * the artwork. The grid is the hero.
 */
export function HeroSection({ totalReleases, totalToday }: HeroSectionProps) {
  return (
    <section className="px-5 pb-10 pt-28 text-center md:pt-36">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-star-white md:text-6xl"
      >
        A universe of music,
        <br />
        <span className="text-star-white/40">one link away.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.7 }}
        className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-star-white/45"
      >
        New drops and canonical albums, updated daily. Tap any cover and
        listen on Spotify, Apple Music, Tidal, SoundCloud or YouTube Music.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.7 }}
        className="mt-7 flex items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-[0.24em] text-star-white/35"
      >
        <span>{totalReleases} releases</span>
        <span className="h-3 w-px bg-star-white/15" />
        <span className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute h-full w-full animate-ping rounded-full bg-star-white/70" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-star-white" />
          </span>
          {totalToday} new today
        </span>
        <span className="h-3 w-px bg-star-white/15" />
        <span>5 platforms</span>
      </motion.div>
    </section>
  );
}
