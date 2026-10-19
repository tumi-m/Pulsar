"use client";

import { useState } from "react";
import { Experience3D } from "@/components/three/Experience3D";
import { BassLoader } from "@/components/three/BassLoader";
import { useHeldReadout } from "@/components/three/useHeldReadout";
import type { PerfSample } from "@/lib/perf-harness";
import type { Stage } from "@/lib/three/stage";
import type { FxTier } from "@/lib/three/quality";

/**
 * /experience — the Observatory route (P1).
 *
 * The immersive hero: capability gate → Bass loader → starfield, particle
 * wordmark, curtain reveal → "dig the crate" (the visitor's records drop
 * into a crate and can be flicked). The accessible 2D baseline is served
 * whenever the probe declines 3D. Nothing is lost either way.
 */

function Fallback() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-deck px-6 text-center">
      <h1 className="text-3xl font-bold uppercase tracking-tight text-ink">
        A universe of music
      </h1>
      <p className="mt-3 max-w-sm text-sm text-ink/45">
        Your device or preferences opted out of the immersive 3D layer — the
        accessible experience is served instead. Nothing is lost.
      </p>
    </div>
  );
}

// Hoisted so Experience3D's memo holds: the HUD below updates several times a
// second and must not re-render the canvas each time.
const FALLBACK = <Fallback />;
const LOADER = <BassLoader />;

/** Pointer gestures for sighted visitors — visual only (see the caption below). */
const HINT: Partial<Record<Stage, string>> = {
  dropping: "Digging…",
  settled: "Drag a record to flick it · tap to toss",
  static: "Tap a record to read its label",
};

export default function ExperiencePage() {
  const [perf, setPerf] = useState<PerfSample | null>(null);
  const [stage, setStage] = useState<Stage>("opening");
  const [readout, onDig] = useHeldReadout();
  const [records, setRecords] = useState<string[]>([]);
  const [fx, setFx] = useState<FxTier | null>(null);

  return (
    <>
      {/* a11y title — the 3D wordmark is decorative until it assembles */}
      <h1 className="sr-only">PULSAR — a universe of music</h1>
      {/* The canvas can't be focused or operated without a pointer, so what
          picking a record would tell you is here as text instead. */}
      {records.length ? (
        <ul className="sr-only" aria-label="Your records in the crate">
          {records.map((label, i) => (
            <li key={i}>{label}</li>
          ))}
        </ul>
      ) : null}

      <Experience3D
        fallback={FALLBACK}
        loader={LOADER}
        onPerf={setPerf}
        onStage={setStage}
        onDig={onDig}
        onRecords={setRecords}
        onFx={setFx}
      />

      {/* dev readout — Off-White industrial numbering */}
      <div
        aria-hidden="true"
        data-three-hud=""
        data-stage={stage}
        data-fx={fx ?? ""}
        className="pointer-events-none fixed left-5 top-16 z-10 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50"
      >
        <p>{stage === "opening" ? "01 / Observatory" : "02 / Dig the crate"}</p>
        <p className="mt-1 text-ink/30">
          {perf
            ? `${perf.fps} fps · ${perf.frameMs.toFixed(1)}ms${perf.overBudget ? " · over" : ""}`
            : "probing…"}
        </p>
        {fx ? <p className="mt-1 text-ink/30">fx · {fx === "full" ? "bloom finish" : "lite"}</p> : null}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-10 flex justify-center px-6">
        <div className="flex max-w-md flex-col items-center gap-2 text-center">
          {/* Announced: only a picked record's label. The stage hints are
              pointer instructions an AT user can't follow, so the visible
              caption (label, else hint) is hidden from AT instead. */}
          <p aria-live="polite" className="sr-only">
            {readout ?? ""}
          </p>
          {/* the held record's label reads out like the deck's LCD */}
          <p
            aria-hidden="true"
            data-three-caption=""
            className="min-h-[1.25rem] font-mono text-[11px] uppercase tracking-[0.18em] text-lcd/80"
          >
            {readout ?? HINT[stage] ?? ""}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-ink/35">
            starfield · constellation wordmark · curtain reveal · crate physics · bloom finish · perf-gated
          </p>
        </div>
      </div>
    </>
  );
}
