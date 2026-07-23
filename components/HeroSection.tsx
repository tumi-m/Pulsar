"use client";

import { motion } from "framer-motion";

interface HeroSectionProps {
  totalReleases: number;
  totalToday: number;
}

/**
 * Minimal hero — a single dreamy line. Less text, no date.
 */
export function HeroSection({ totalReleases, totalToday }: HeroSectionProps) {
  void totalReleases;
  void totalToday;
  return (
    <section className="px-5 pb-8 pt-24 text-center md:pt-32">
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl text-5xl font-bold tracking-tight md:text-8xl"
        style={{
          background: "linear-gradient(120deg, #ffe8c9 0%, #ff9d5c 22%, #ff5fa2 48%, #9b5de5 72%, #00d4ff 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pulsar
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.9 }}
        className="mt-4 text-[11px] font-bold uppercase tracking-[0.4em] text-star-white/45"
      >
        Music discovery
      </motion.p>
    </section>
  );
}
