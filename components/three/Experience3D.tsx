"use client";

import { Suspense, useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { probeCapabilities, type Capabilities } from "@/lib/capabilities";
import { PerfHarness, type PerfSample } from "@/lib/perf-harness";

/**
 * Experience3D — P0 foundation.
 *
 * A capability-gated R3F canvas. On unsupported/reduced-motion devices it
 * renders `fallback` (the accessible 2D baseline) instead. Adaptive DPR +
 * PerformanceMonitor keep it inside the frame budget. The starfield here
 * is a proof-of-life; later phases replace `<Scene/>` with real set-pieces.
 */

interface Experience3DProps {
  fallback: React.ReactNode;
  /** surface perf samples (e.g. a dev HUD) */
  onPerf?: (s: PerfSample) => void;
}

function Starfield({ count = 2600 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // distribute in a deep shell around the camera
      const r = 6 + Math.random() * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      // cosmic palette: violet → ion blue → near-white
      c.setHSL(0.62 + Math.random() * 0.12, 0.55, 0.6 + Math.random() * 0.35);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [count]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.02;
      pointsRef.current.rotation.x += delta * 0.006;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function PerfBridge({ onPerf }: { onPerf?: (s: PerfSample) => void }) {
  const harness = useMemo(() => new PerfHarness(onPerf), [onPerf]);
  useFrame(({ clock }) => {
    harness.tick(clock.elapsedTime * 1000);
  });
  return null;
}

function Scene({ onPerf }: { onPerf?: (s: PerfSample) => void }) {
  return (
    <>
      <color attach="background" args={["#04040a"]} />
      <fog attach="fog" args={["#04040a", 12, 34]} />
      <ambientLight intensity={0.4} />
      <Starfield />
      <PerfBridge onPerf={onPerf} />
    </>
  );
}

export function Experience3D({ fallback, onPerf }: Experience3DProps) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [dpr, setDpr] = useState(1.5);

  useEffect(() => {
    setCaps(probeCapabilities());
  }, []);

  // Before probe resolves (SSR / first paint) show the accessible baseline.
  if (!caps) return <>{fallback}</>;
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
          <Scene onPerf={onPerf} />
        </Suspense>
      </Canvas>
    </div>
  );
}
