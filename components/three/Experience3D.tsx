"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { probeCapabilities, type Capabilities } from "@/lib/capabilities";
import { PerfHarness, type PerfSample } from "@/lib/perf-harness";
import { Observatory } from "@/components/three/Observatory";

/**
 * Experience3D — capability-gated R3F canvas (P0 scaffold, P1 content).
 *
 * On unsupported/reduced-motion devices it renders `fallback` (the
 * accessible 2D baseline) instead. While the probe resolves (and inside
 * Suspense) it shows `loader` — a designed title event, never a spinner.
 * Adaptive DPR + PerformanceMonitor keep it inside the frame budget.
 */

interface Experience3DProps {
  fallback: React.ReactNode;
  /** designed loading state (e.g. <BassLoader/>) */
  loader?: React.ReactNode;
  /** surface perf samples (e.g. a dev HUD) */
  onPerf?: (s: PerfSample) => void;
}

function PerfBridge({ onPerf }: { onPerf?: (s: PerfSample) => void }) {
  const harness = useMemo(() => new PerfHarness(onPerf), [onPerf]);
  useFrame(({ clock }) => {
    harness.tick(clock.elapsedTime * 1000);
  });
  return null;
}

export function Experience3D({ fallback, loader, onPerf }: Experience3DProps) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [dpr, setDpr] = useState(1.5);

  useEffect(() => {
    setCaps(probeCapabilities());
  }, []);

  // Before probe resolves (SSR / first paint) show the designed loader.
  if (!caps) return <>{loader ?? fallback}</>;
  if (!caps.enable3D) return <>{fallback}</>;

  return (
    <div className="fixed inset-0 -z-0">
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
        camera={{ position: [0, 0, 8], fov: 60 }}
      >
        <PerformanceMonitor
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(Math.min(2, window.devicePixelRatio || 1.5))}
        />
        <AdaptiveDpr pixelated />
        <Suspense fallback={null}>
          <Observatory reducedMotion={caps.reducedMotion} />
          <PerfBridge onPerf={onPerf} />
        </Suspense>
      </Canvas>
    </div>
  );
}

