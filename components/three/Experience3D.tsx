"use client";

import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { probeCapabilities, type Capabilities } from "@/lib/capabilities";
import { PerfHarness, type PerfSample } from "@/lib/perf-harness";
import {
  FxGovernor,
  dprCap,
  initialFxTier,
  parseFxOverride,
  shouldRender3D,
  type FxTier,
} from "@/lib/three/quality";
import { FOV, OPENING_POSE, type Stage } from "@/lib/three/stage";
import { Observatory } from "@/components/three/Observatory";
import { ChunkBoundary } from "@/components/three/ChunkBoundary";
import { loadFinish } from "@/components/three/lazy";
import { SceneClock } from "@/components/three/sceneClock";
import { usePrefersReducedMotion } from "@/components/three/usePrefersReducedMotion";

/**
 * Experience3D — capability-gated R3F canvas (P0 scaffold, P1 content).
 *
 * Without WebGL2, on data-saver or on a low-memory device it renders
 * `fallback` (the accessible 2D baseline) instead. Reduced motion gets the
 * scene's still form rather than the 2D page — followed live, so turning it
 * on mid-visit stills the scene at once. While the probe resolves it shows
 * `loader` — a designed title event, never a spinner.
 *
 * Frame budget: DPR is capped per quality tier and stepped down by the
 * PerformanceMonitor; the postprocessing finish (its own lazy chunk) is
 * skipped on low-tier devices and dropped for good if the perf harness sees
 * sustained slow frames; and once the still form has nothing left to
 * animate the canvas renders on demand instead of 60 times a second.
 */

const Finish = lazy(loadFinish);

interface Experience3DProps {
  fallback: React.ReactNode;
  /** designed loading state (e.g. <BassLoader/>) */
  loader?: React.ReactNode;
  /** surface perf samples (e.g. a dev HUD) — a few per second */
  onPerf?: (s: PerfSample) => void;
  onStage?: (s: Stage) => void;
  /** the record the visitor is holding (its label), or null once let go */
  onDig?: (label: string | null) => void;
  /** the visitor's own records in the crate (labels), once it's filled */
  onRecords?: (labels: string[]) => void;
  onFx?: (tier: FxTier) => void;
}

/** A HUD needs a handful of readings a second, not one per frame. */
const PERF_REPORT_MS = 250;

function PerfBridge({ onPerf, onSlow }: { onPerf?: (s: PerfSample) => void; onSlow?: () => void }) {
  const harness = useMemo(() => new PerfHarness(), []);
  const governor = useMemo(() => new FxGovernor(), []);
  const lastReport = useRef(-Infinity);
  useFrame(() => {
    // not state.clock: R3F zeroes it when the frameloop mode changes
    const now = performance.now();
    const sample = harness.tick(now);
    if (onSlow && governor.push(sample, now)) onSlow();
    if (onPerf && now - lastReport.current >= PERF_REPORT_MS) {
      lastReport.current = now;
      onPerf(sample);
    }
  });
  return null;
}

/**
 * Reports `idle` once the scene has been still for a few frames — long
 * enough for the last commits (records placed, composer passes built) to
 * reach the screen before the loop stops.
 */
function IdleWhenStill({ still, onIdle }: { still: boolean; onIdle: (idle: boolean) => void }) {
  const frames = useRef(0);
  const sent = useRef(false);
  useEffect(() => {
    if (still) return;
    frames.current = 0;
    if (sent.current) {
      sent.current = false;
      onIdle(false);
    }
  }, [still, onIdle]);
  useFrame(() => {
    if (!still || sent.current) return;
    if (++frames.current >= 30) {
      sent.current = true;
      onIdle(true);
    }
  });
  return null;
}

export const Experience3D = memo(function Experience3D({
  fallback,
  loader,
  onPerf,
  onStage,
  onDig,
  onRecords,
  onFx,
}: Experience3DProps) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [tier, setTier] = useState<FxTier>("lite");
  const [pinned, setPinned] = useState(false);
  const [dpr, setDpr] = useState(1);
  const [stage, setStage] = useState<Stage>("opening");
  const [finishReady, setFinishReady] = useState(false);
  const [idle, setIdle] = useState(false);
  // Fixed at creation (R3F never rebuilds the renderer). The full tier's
  // composer does its own MSAA; a multisampled default framebuffer under it
  // would only cost memory.
  const [antialias, setAntialias] = useState(true);
  // the sequence's t=0 — see sceneClock.ts for why it isn't R3F's clock
  const [sceneStart, setSceneStart] = useState(0);
  // live, not lib/motion's mount-time snapshot (see the hook)
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const probed = probeCapabilities();
    const nav = navigator as Navigator & { deviceMemory?: number };
    const override = parseFxOverride(window.location.search);
    const initial = initialFxTier(
      probed,
      { hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory },
      override,
    );
    setCaps(probed);
    setSceneStart(performance.now());
    setTier(initial);
    setAntialias(initial === "lite");
    setPinned(override !== null);
    setDpr(dprCap(initial, window.devicePixelRatio));
  }, []);

  useEffect(() => {
    if (caps) onFx?.(tier);
  }, [caps, tier, onFx]);

  const handleStage = useCallback(
    (s: Stage) => {
      setStage(s);
      onStage?.(s);
    },
    [onStage],
  );
  const degrade = useCallback(() => setTier("lite"), []);
  const markFinishReady = useCallback(() => setFinishReady(true), []);
  // Stable option objects: R3F re-applies camera options whenever they change.
  const camera = useMemo(() => ({ position: OPENING_POSE.position, fov: FOV }), []);
  const sceneClock = useMemo(() => ({ start: sceneStart }), [sceneStart]);
  const gl = useMemo(
    () => ({ antialias, powerPreference: "high-performance" as const, alpha: false }),
    [antialias],
  );

  // Before probe resolves (SSR / first paint) show the designed loader.
  if (!caps) return <>{loader ?? fallback}</>;
  if (!shouldRender3D(caps)) return <>{fallback}</>;

  const maxDpr = dprCap(tier, window.devicePixelRatio);
  const still = stage === "static" && (tier === "lite" || finishReady);

  return (
    // touch-none: a drag on a record must not become a pull-to-refresh
    <div className="fixed inset-0 -z-0 touch-none">
      <Canvas flat dpr={dpr} frameloop={idle ? "demand" : "always"} gl={gl} camera={camera}>
        <SceneClock.Provider value={sceneClock}>
          <PerformanceMonitor
            flipflops={3}
            onDecline={() => setDpr(1)}
            onIncline={() => setDpr(maxDpr)}
            onFallback={() => {
              setDpr(1);
              if (!pinned) degrade();
            }}
          />
          <AdaptiveDpr pixelated />
          <Suspense fallback={null}>
            <Observatory reducedMotion={reducedMotion} onStage={handleStage} onDig={onDig} onRecords={onRecords} />
            <PerfBridge onPerf={onPerf} onSlow={pinned ? undefined : degrade} />
          </Suspense>
          {tier === "full" ? (
            <ChunkBoundary>
              <Suspense fallback={null}>
                <Finish
                  reducedMotion={reducedMotion}
                  multisampling={caps.coarsePointer ? 2 : 4}
                  onReady={markFinishReady}
                />
              </Suspense>
            </ChunkBoundary>
          ) : null}
          <IdleWhenStill still={still} onIdle={setIdle} />
        </SceneClock.Provider>
      </Canvas>
    </div>
  );
});
