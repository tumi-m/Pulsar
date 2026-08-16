"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AUTHORITY, buildConstellation, sampleWordmark } from "@/lib/three/wordmark";

/**
 * Observatory — P1 hero set-piece.
 *
 * A slow drift through a starfield; the "PULSAR" wordmark assembles from a
 * scattered constellation (constellation snap), then the curtain opens —
 * fog pulls back and the structural grid materialises below (curtain
 * reveal). Everything honours reduced-motion with snap + crossfade.
 */

const VOID = "#04040a";
const ION = "#00d4ff";
const MIST = "#2a2a4a";

/* Wordmark begins after a beat of anticipation (fog still closed). */
const WORDMARK_T0 = 1.1;
/* Grid + fog curtain start once the letters have mostly landed. */
const CURTAIN_T0 = 2.6;

function Starfield({ count = 2600, reducedMotion = false }: { count?: number; reducedMotion?: boolean }) {
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
    if (pointsRef.current && !reducedMotion) {
      // slow cosmic drift — respect, not a ride
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


function Wordmark({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const matRef = useRef<THREE.PointsMaterial>(null);

  const constellation = useMemo(
    () => buildConstellation(sampleWordmark("PULSAR"), { scale: 4.4, seed: 7 }),
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // initialise on the scattered shell — the reveal starts far away
    g.setAttribute("position", new THREE.BufferAttribute(constellation.start.slice(), 3));
    return g;
  }, [constellation]);

  const colors = useMemo(() => {
    const arr = new Float32Array(constellation.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < constellation.count; i++) {
      // mostly star-white with ion-blue sparks
      c.setHSL(i % 9 === 0 ? 0.53 : 0.65, i % 9 === 0 ? 0.9 : 0.1, 0.86 + Math.random() * 0.12);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, [constellation]);

  const settleT = WORDMARK_T0 + 1 + constellation.flightSeconds + 0.3;

  useFrame(({ clock }) => {
    if (!constellation.count) return;
    const t = clock.elapsedTime;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const { start, target, delay, flightSeconds, count } = constellation;

    for (let i = 0; i < count; i++) {
      const raw = reducedMotion
        ? t - WORDMARK_T0 > 0
          ? 1
          : 0
        : (t - WORDMARK_T0 - delay[i]) / flightSeconds;
      const e = AUTHORITY(Math.min(1, Math.max(0, raw)));
      const j = i * 3;
      arr[j] = start[j] + (target[j] - start[j]) * e;
      arr[j + 1] = start[j + 1] + (target[j + 1] - start[j + 1]) * e;
      arr[j + 2] = start[j + 2] + (target[j + 2] - start[j + 2]) * e;
    }
    attr.needsUpdate = true;

    // settle: a slow breath in the opacity, nothing more
    if (matRef.current) {
      const ramp = Math.min(1, Math.max(0, (t - WORDMARK_T0) / 0.8));
      const breathe = Math.sin(t * 0.6) * 0.04;
      matRef.current.opacity = 0.9 * ramp + (t > settleT ? breathe : 0);
    }
  });

  if (!constellation.count) return null; // no canvas rasteriser → the DOM title carries the meaning

  return (
    <points geometry={geometry} position={[0, 0.2, 0]}>
      <pointsMaterial
        ref={matRef}
        size={0.045}
        vertexColors
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
      <bufferAttribute attach="attributes-color" args={[colors, 3]} />
    </points>
  );
}

/** The curtain reveal: fog opens and the Mies grid fades in below. */
function Curtain({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const gridMat = useRef<THREE.Material | null>(null);

  useFrame(({ scene, clock }) => {
    const t = clock.elapsedTime;

    const open = reducedMotion
      ? t > CURTAIN_T0
        ? 1
        : 0
      : AUTHORITY(Math.min(1, Math.max(0, (t - CURTAIN_T0) / 2.2)));
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.far = 14 + open * 22;
      fog.near = 8 - open * 3;
    }
    if (gridMat.current) {
      gridMat.current.opacity = 0.16 * open;
    }
  });

  return (
    <gridHelper
      args={[64, 32, ION, MIST]}
      position={[0, -3, -6]}
      material-transparent
      material-opacity={0}
      ref={(grid: THREE.GridHelper | null) => {
        gridMat.current = grid?.material ?? null;
      }}
    />
  );
}

/** Slow dolly sway — cinematic, never a vestibular trigger. */
function CameraDrift({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const origin = useRef<{ x: number; y: number } | null>(null);

  useFrame(({ camera, clock }) => {
    if (!origin.current) {
      origin.current = { x: camera.position.x, y: camera.position.y };
    }
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    camera.position.x = origin.current.x + Math.sin(t * 0.05) * 0.6;
    camera.position.y = origin.current.y + Math.cos(t * 0.04) * 0.25;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export function Observatory({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 8, 14]} />
      <ambientLight intensity={0.4} />
      <Starfield reducedMotion={reducedMotion} />
      <Wordmark reducedMotion={reducedMotion} />
      <Curtain reducedMotion={reducedMotion} />
      <CameraDrift reducedMotion={reducedMotion} />
    </>
  );
}
