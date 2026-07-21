"use client";

import { useState } from "react";
import { Experience3D } from "@/components/three/Experience3D";
import type { PerfSample } from "@/lib/perf-harness";

/**
 * /experience — P0 proof route.
 *
 * Verifies the 3D foundation in isolation without touching the live home
 * grid: capability gate, R3F canvas, adaptive DPR, perf harness, and the
 * accessible 2D fallback. Later phases replace the starfield Scene with
 * the real set-pieces (Observatory, Hall, …).
 */

function Fallback() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-void px-6 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-star-white/40">
        “2D Baseline”
      </p>
      <h1 className="mt-3 text-3xl font-bold uppercase tracking-tight text-star-white">
        “A universe of music”
      </h1>
      <p className="mt-3 max-w-sm text-sm text-star-white/45">
        Your device or preferences opted out of the immersive 3D layer — the
        accessible experience is served instead. Nothing is lost.
      </p>
    </div>
  );
}

export default function ExperiencePage() {
  const [perf, setPerf] = useState<PerfSample | null>(null);

  return (
    <>
      <Experience3D fallback={<Fallback />} onPerf={setPerf} />

      {/* P0 dev HUD — Off-White industrial readout */}
      <div className="pointer-events-none fixed left-5 top-16 z-10 font-mono text-[10px] uppercase tracking-[0.2em] text-star-white/50">
        <p>“P0 · Foundations”</p>
        <p className="mt-1 text-star-white/30">
          {perf ? `${perf.fps} fps · ${perf.frameMs.toFixed(1)}ms${perf.overBudget ? " · over" : ""}` : "probing…"}
        </p>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-10 -translate-x-1/2 text-center">
        <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-star-white/35">
          “Observatory” — starfield proof · adaptive DPR · perf-gated
        </p>
      </div>
    </>
  );
}
