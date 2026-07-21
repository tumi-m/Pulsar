"use client";

import { motion } from "framer-motion";

interface HeroSectionProps {
  totalReleases: number;
  totalToday: number;
}

/**
 * Off-White™-inspired intro: Helvetica bold caps, quoted labels,
 * industrial arrows — floating in the cosmos. The grid is the hero.
 */
export function HeroSection({ totalReleases, totalToday }: HeroSectionProps) {
  return (
    <section className="px-5 pb-10 pt-28 text-center md:pt-36">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="text-[10px] font-bold uppercase tracking-[0.4em] text-star-white/40"
      >
        “Music Discovery” — est. 2026
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-4 max-w-4xl text-4xl font-bold uppercase leading-[1.02] tracking-tight text-star-white md:text-7xl"
      >
        “A universe
        <br />
        of music”
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.7 }}
        className="mx-auto mt-6 max-w-md text-[11px] font-bold uppercase leading-relaxed tracking-[0.2em] text-star-white/45"
      >
        New drops + canonical albums, daily →
        <br />
        Spotify · Apple Music · Tidal · SoundCloud · YouTube Music
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.7 }}
        className="mt-8 flex items-center justify-center gap-6 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/35"
      >
        <span>“{totalReleases}” releases</span>
        <span className="h-3 w-px bg-star-white/15" />
        <span className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute h-full w-full animate-ping rounded-full bg-star-white/70" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-star-white" />
          </span>
          “{totalToday}” new today
        </span>
        <span className="h-3 w-px bg-star-white/15" />
        <span>“5” platforms</span>
      </motion.div>
    </section>
  );
}
