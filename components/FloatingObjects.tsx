"use client";

import { motion } from "framer-motion";

/**
 * Immersive drifting background — translucent 3D physical-media
 * silhouettes (vinyl, cassette, floppy, disc) floating slowly through
 * the cosmos behind the grid. Pure CSS, pointer-events off.
 */

const OBJECTS = [
  { kind: "ring", x: "8%", y: "18%", size: 120, dur: 26, delay: 0 },
  { kind: "square", x: "82%", y: "12%", size: 90, dur: 32, delay: 3 },
  { kind: "ring", x: "70%", y: "62%", size: 160, dur: 38, delay: 1 },
  { kind: "square", x: "16%", y: "72%", size: 70, dur: 29, delay: 5 },
  { kind: "disc", x: "46%", y: "30%", size: 100, dur: 34, delay: 2 },
  { kind: "ring", x: "90%", y: "84%", size: 80, dur: 24, delay: 4 },
  { kind: "disc", x: "30%", y: "48%", size: 60, dur: 40, delay: 6 },
];

export function FloatingObjects() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {OBJECTS.map((o, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: o.x, top: o.y, width: o.size, height: o.size }}
          animate={{
            y: [0, -28, 0],
            x: [0, 14, 0],
            rotate: o.kind === "square" ? [0, 8, -6, 0] : [0, 360],
          }}
          transition={{
            duration: o.dur,
            repeat: Infinity,
            ease: o.kind === "square" ? "easeInOut" : "linear",
            delay: o.delay,
          }}
        >
          {o.kind === "ring" && (
            <div
              className="h-full w-full rounded-full border"
              style={{
                borderColor: "rgba(155,93,229,0.10)",
                borderWidth: Math.max(6, o.size / 14),
                boxShadow: "inset 0 0 40px rgba(0,212,255,0.05)",
              }}
            />
          )}
          {o.kind === "disc" && (
            <div
              className="h-full w-full rounded-full"
              style={{
                background:
                  "repeating-radial-gradient(circle at center, rgba(255,255,255,0.02) 0px, rgba(155,93,229,0.04) 2px, rgba(255,255,255,0.02) 4px)",
                boxShadow: "0 0 30px rgba(0,212,255,0.04)",
              }}
            >
              <div className="absolute inset-[44%] rounded-full bg-neon-blue/10" />
            </div>
          )}
          {o.kind === "square" && (
            <div
              className="h-full w-full rounded-[10px] border"
              style={{
                borderColor: "rgba(0,212,255,0.10)",
                background: "linear-gradient(160deg, rgba(255,255,255,0.02), transparent)",
              }}
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}
