"use client";

import { useEffect, useState } from "react";

/**
 * Whisper-quiet background bubbles. Deliberately understated: very low opacity,
 * soft blur, slow drift — atmosphere you notice only if you look for it.
 *
 * Pure CSS animation (compositor-friendly, no JS per frame). Fewer bubbles on
 * phones, and none at all when the user prefers reduced motion.
 */

interface Bubble {
  left: number; // vw
  size: number; // px
  dur: number; // s
  delay: number; // s
  drift: number; // px
  tint: string;
}

const TINTS = [
  "rgba(155,93,229,0.16)", // violet
  "rgba(0,212,255,0.14)", // blue
  "rgba(255,95,162,0.12)", // pink
  "rgba(232,232,244,0.10)", // starlight
];

function build(count: number): Bubble[] {
  return Array.from({ length: count }, (_, i) => {
    // Deterministic-ish spread so bubbles never clump in one column.
    const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    return {
      left: r(1) * 100,
      size: 14 + r(2) * 46,
      dur: 26 + r(3) * 30,
      delay: -r(4) * 40, // negative: mid-flight on first paint, no empty start
      drift: (r(5) - 0.5) * 70,
      tint: TINTS[Math.floor(r(6) * TINTS.length)],
    };
  });
}

export function Bubbles() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    setBubbles(build(touch ? 9 : 16));
  }, []);

  if (bubbles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {bubbles.map((b, i) => (
        <span
          key={i}
          className="pulsar-bubble absolute bottom-[-12vh] rounded-full"
          style={{
            left: `${b.left}vw`,
            width: b.size,
            height: b.size,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            ["--drift" as string]: `${b.drift}px`,
            background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.22), ${b.tint} 46%, transparent 72%)`,
            boxShadow: `inset 0 0 ${Math.round(b.size / 3)}px ${b.tint}`,
          }}
        />
      ))}
    </div>
  );
}
