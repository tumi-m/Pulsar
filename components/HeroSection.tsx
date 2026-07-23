"use client";

import { useEffect, useState } from "react";
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
  // When the album/tracklist panel opens (right half), re-center the Pulsar
  // letterhead over the visible left half.
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", on);
    return () => window.removeEventListener("pulsar-detail-open", on);
  }, []);

  // Spacing follows the Fibonacci sequence (21 / 34 / 89 / 144 px) so the
  // letterhead sits in golden proportion above the search bar.
  return (
    <section
      className={`px-[21px] pb-[34px] pt-[89px] text-center transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:pt-[144px] ${
        detailOpen ? "lg:pr-[50vw]" : ""
      }`}
    >
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
        className="mt-[13px] text-[11px] font-bold uppercase tracking-[0.4em] text-star-white/45"
      >
        Music discovery
      </motion.p>
    </section>
  );
}
