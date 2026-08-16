"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface HeroSectionProps {
  totalToday: number;
}

/** Count up to `n` over ~1s once the hero mounts, so the catalog size feels alive. */
function useCountUp(n: number, duration = 1000) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (n <= 0) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo for a snappy settle
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setVal(Math.round(eased * n));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [n, duration]);
  return val;
}

/**
 * The Pulsar letterhead. Kept deliberately compact — the search bar (with its
 * rotating feature reel) floats in the reserved space below, so the header and
 * search read as one cohesive unit with no overlap.
 */
export function HeroSection({ totalToday }: HeroSectionProps) {
  // When the album/tracklist panel opens (right half), re-center the Pulsar
  // letterhead over the visible left half.
  const [detailOpen, setDetailOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    const onSamples = (e: Event) => setSamplesOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", on);
    window.addEventListener("pulsar-samples-open", onSamples);
    return () => {
      window.removeEventListener("pulsar-detail-open", on);
      window.removeEventListener("pulsar-samples-open", onSamples);
    };
  }, []);

  const countedToday = useCountUp(totalToday, 700);

  // Fibonacci spacing above; the generous bottom padding reserves room for the
  // floating search bar + feature reel so the grid always starts below them.
  return (
    <section
      className={`px-[21px] pb-[132px] pt-[89px] text-center transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:pb-[140px] md:pt-[120px] ${
        detailOpen || samplesOpen ? "lg:pr-[50vw]" : ""
      }`}
    >
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl text-5xl font-bold tracking-tight md:text-7xl"
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

      {/* Live catalog stats — the daily growth made visible */}
      {totalToday > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.8 }}
          className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-neon-violet/40 bg-neon-violet/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neon-violet"
              style={{ boxShadow: "0 0 20px rgba(155,93,229,0.25)" }}
            >
              <Sparkles size={11} />
              {countedToday} fresh today
            </span>
          </div>
        </motion.div>
      )}
    </section>
  );
}
