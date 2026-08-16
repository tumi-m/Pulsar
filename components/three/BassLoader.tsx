"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * BassLoader — the designed loader (P1).
 *
 * A Saul-Bass title event, not a spinner: the wordmark drops in letter by
 * letter with the authoritative easing, then holds. Honours
 * prefers-reduced-motion with a plain crossfade.
 */

const LETTERS = ["P", "U", "L", "S", "A", "R"];

export function BassLoader({
  caption = "Now entering the Observatory",
}: {
  caption?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-void"
      role="status"
      aria-label="Loading the Observatory"
    >
      <div className="flex select-none" aria-hidden="true">
        {LETTERS.map((letter, i) => (
          <motion.span
            key={i}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scaleY: 1.35 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            transition={{
              delay: 0.09 * i,
              duration: reduced ? 0.2 : 0.7,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="text-4xl font-bold uppercase tracking-[0.18em] text-star-white md:text-6xl"
          >
            {letter}
          </motion.span>
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: reduced ? 0.2 : 0.6 }}
        className="mt-5 font-mono text-[10px] uppercase tracking-[0.3em] text-star-white/40"
      >
        {caption}
      </motion.p>
    </div>
  );
}
