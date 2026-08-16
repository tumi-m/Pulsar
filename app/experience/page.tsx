"use client";

import { useState } from "react";
import { Experience3D } from "@/components/three/Experience3D";
import { BassLoader } from "@/components/three/BassLoader";
import type { PerfSample } from "@/lib/perf-harness";

/**
 * /experience — the Observatory route (P1).
 *
 * The immersive hero: capability gate → Bass loader → starfield, particle
 * wordmark, curtain reveal. The accessible 2D baseline is served whenever
 * the probe declines 3D. Nothing is lost either way.
 */

function Fallback() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-void px-6 text-center">
      <h1 className="text-3xl font-bold uppercase tracking-tight text-star-white">
        A universe of music
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
      {/* a11y title — the 3D wordmark is decorative until it assembles */}
      <h1 className="sr-only">PULSAR — a universe of music</h1>

      <Experience3D fallback={<Fallback />} loader={<BassLoader />} onPerf={setPerf} />

      {/* dev readout — Off-White industrial numbering */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-5 top-16 z-10 font-mono text-[10px] uppercase tracking-[0.2em] text-star-white/50"
      >
        <p>01 / Observatory</p>
        <p className="mt-1 text-star-white/30">
          {perf
            ? `${perf.fps} fps · ${perf.frameMs.toFixed(1)}ms${perf.overBudget ? " · over" : ""}`
            : "probing…"}
        </p>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-10 -translate-x-1/2 text-center">
        <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-star-white/35">
          starfield · constellation wordmark · curtain reveal · perf-gated
        </p>
      </div>
    </>
  );
}

