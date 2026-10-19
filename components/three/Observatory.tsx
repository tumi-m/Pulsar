"use client";

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AUTHORITY, buildConstellation, constellationHalfWidth, mulberry32, sampleWordmark } from "@/lib/three/wordmark";
import {
  DIG_HALF_WIDTH,
  DIG_POSE,
  FLOOR_Y,
  FOV,
  OPENING_DISTANCE,
  OPENING_POSE,
  SEQUENCE,
  SWAY,
  curtainFog,
  fitPose,
  fitScale,
  type Stage,
} from "@/lib/three/stage";
import { loadCrateScene, loadRecordsPhysics } from "@/components/three/lazy";
import { ChunkBoundary } from "@/components/three/ChunkBoundary";
import { useSceneTime } from "@/components/three/sceneClock";

/**
 * Observatory — P1 hero set-piece.
 *
 * A slow drift through a starfield; the "PULSAR" wordmark assembles from a
 * scattered constellation (constellation snap), then the curtain opens —
 * fog pulls back and the structural grid materialises below (curtain
 * reveal). Once the letters land the camera settles onto a record crate on
 * that grid and the visitor's records drop into it ("dig the crate", a lazy
 * chunk). Everything honours reduced-motion with snap + crossfade: no drift,
 * no travel, the records already at rest.
 */

const VOID = "#0b0d10";
const ION = "#4e86c7";
const MIST = "#252d36";

const CrateScene = lazy(loadCrateScene);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function Starfield({ count = 2600, reducedMotion = false }: { count?: number; reducedMotion?: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    // seeded: the same sky on every render (and every visit)
    const rand = mulberry32(count);
    for (let i = 0; i < count; i++) {
      // distribute in a deep shell around the camera
      const r = 6 + rand() * 26;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      // cosmic palette: violet → ion blue → near-white
      c.setHSL(0.62 + rand() * 0.12, 0.55, 0.6 + rand() * 0.35);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // GL points are squares; a star near the camera drew as a visible square,
  // and the bloom finish made it a glowing one. A soft round sprite instead.
  const sprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => sprite.dispose(), [sprite]);

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
        map={sprite}
        // the sprite's falloff dims each star; a touch larger keeps the sky's density
        size={0.07}
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
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));

  const constellation = useMemo(
    () => buildConstellation(sampleWordmark("PULSAR"), { scale: 4.4, seed: 7 }),
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // initialise on the scattered shell — the reveal starts far away
    g.setAttribute("position", new THREE.BufferAttribute(constellation.start.slice(), 3));
    const colors = new Float32Array(constellation.count * 3);
    const c = new THREE.Color();
    const rand = mulberry32(11);
    for (let i = 0; i < constellation.count; i++) {
      // mostly star-white with ion-blue sparks
      c.setHSL(i % 9 === 0 ? 0.53 : 0.65, i % 9 === 0 ? 0.9 : 0.1, 0.86 + rand() * 0.12);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    // The colours must live on the geometry. A <bufferAttribute
    // attach="attributes-color"> child of <points> attaches to
    // points.attributes (which doesn't exist), so vertexColors read black —
    // and additive black is invisible: the wordmark never showed.
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [constellation]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // ~13 units wide: fits a desktop frame, runs off both edges of a phone.
  const fit = useMemo(
    () => fitScale(aspect, FOV, OPENING_DISTANCE, constellationHalfWidth(constellation)),
    [aspect, constellation],
  );

  const settleT = SEQUENCE.wordmark + 1 + constellation.flightSeconds + 0.3;
  const sceneTime = useSceneTime();

  useFrame(() => {
    if (!constellation.count) return;
    const t = sceneTime();
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const { start, target, delay, flightSeconds, count } = constellation;

    for (let i = 0; i < count; i++) {
      const raw = reducedMotion
        ? t - SEQUENCE.wordmark > 0
          ? 1
          : 0
        : (t - SEQUENCE.wordmark - delay[i]) / flightSeconds;
      const e = AUTHORITY(clamp01(raw));
      const j = i * 3;
      arr[j] = start[j] + (target[j] - start[j]) * e;
      arr[j + 1] = start[j + 1] + (target[j + 1] - start[j + 1]) * e;
      arr[j + 2] = start[j + 2] + (target[j + 2] - start[j + 2]) * e;
    }
    attr.needsUpdate = true;

    // settle: a slow breath in the opacity, nothing more (and not even that
    // when motion is unwelcome — the still scene stops rendering frames)
    if (matRef.current) {
      const ramp = clamp01((t - SEQUENCE.wordmark) / 0.8);
      const breathe = reducedMotion || t <= settleT ? 0 : Math.sin(t * 0.6) * 0.04;
      matRef.current.opacity = 0.9 * ramp + breathe;
    }
  });

  if (!constellation.count) return null; // no canvas rasteriser → the DOM title carries the meaning

  return (
    <points geometry={geometry} position={[0, 0.2, 0]} scale={fit}>
      <pointsMaterial
        ref={matRef}
        // shrink the points with the letters, or a phone's wordmark turns to blobs
        size={0.045 * Math.sqrt(fit)}
        vertexColors
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** The curtain reveal: fog opens and the Mies grid fades in below. */
function Curtain({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const gridMat = useRef<THREE.Material | null>(null);
  const sceneTime = useSceneTime();

  useFrame(({ scene, camera }) => {
    const t = sceneTime();

    const open = reducedMotion
      ? t > SEQUENCE.curtain
        ? 1
        : 0
      : AUTHORITY(clamp01((t - SEQUENCE.curtain) / SEQUENCE.curtainSeconds));
    // The far physics wall stands where this fog hides it, so both read curtainFog.
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      const { near, far } = curtainFog(open, camera.position.length());
      fog.near = near;
      fog.far = far;
    }
    if (gridMat.current) {
      gridMat.current.opacity = 0.16 * open;
    }
  });

  return (
    <gridHelper
      args={[64, 32, ION, MIST]}
      position={[0, FLOOR_Y, -6]}
      material-transparent
      material-opacity={0}
      ref={(grid: THREE.GridHelper | null) => {
        gridMat.current = grid?.material ?? null;
      }}
    />
  );
}

/**
 * The camera: a slow dolly sway around the opening frame, then — once the
 * letters land — an eased move down onto the crate. Reduced motion holds
 * the crate frame from the first frame: no sway, no travel.
 */
function CameraRig({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const dig = useMemo(() => fitPose(DIG_POSE, aspect, FOV, DIG_HALF_WIDTH), [aspect]);
  const sceneTime = useSceneTime();

  useFrame(({ camera }) => {
    const t = sceneTime();
    const k = reducedMotion ? 1 : AUTHORITY(clamp01((t - SEQUENCE.setPiece) / SEQUENCE.cameraSeconds));
    const a = OPENING_POSE;
    const mix = (i: 0 | 1 | 2, from: readonly number[], to: readonly number[]) => from[i] + (to[i] - from[i]) * k;
    camera.position.set(mix(0, a.position, dig.position), mix(1, a.position, dig.position), mix(2, a.position, dig.position));
    if (!reducedMotion) {
      // slow sway — cinematic, never a vestibular trigger (the physics walls
      // stand outside every frame it reaches, so its size lives in stage.ts)
      camera.position.x += Math.sin(t * 0.05) * SWAY.x;
      camera.position.y += Math.cos(t * 0.04) * SWAY.y;
    }
    camera.lookAt(mix(0, a.target, dig.target), mix(1, a.target, dig.target), mix(2, a.target, dig.target));
  });

  return null;
}

/** Fires `onCue` once, the first frame the scene clock passes `at`. */
function Cue({ at, onCue }: { at: number; onCue: () => void }) {
  const fired = useRef(false);
  const sceneTime = useSceneTime();
  useFrame(() => {
    if (!fired.current && sceneTime() >= at) {
      fired.current = true;
      onCue();
    }
  });
  return null;
}

export interface ObservatoryProps {
  reducedMotion?: boolean;
  onStage?: (stage: Stage) => void;
  onDig?: (label: string | null) => void;
  onRecords?: (labels: string[]) => void;
}

export function Observatory({ reducedMotion = false, onStage, onDig, onRecords }: ObservatoryProps) {
  const [digging, setDigging] = useState(false);

  useEffect(() => {
    onStage?.("opening");
  }, [onStage]);

  // Warm the set-piece's chunks a beat early so the crate is ready when the
  // letters land. The still form needs no physics, so it never fetches it.
  const warmAt = reducedMotion ? SEQUENCE.wordmark : SEQUENCE.curtain;
  const digAt = reducedMotion ? SEQUENCE.curtain : SEQUENCE.setPiece;
  const warm = () => {
    loadCrateScene().catch(() => {});
    if (!reducedMotion) loadRecordsPhysics().catch(() => {});
  };

  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 8, 14]} />
      <ambientLight intensity={0.4} />
      <Starfield reducedMotion={reducedMotion} />
      <Wordmark reducedMotion={reducedMotion} />
      <Curtain reducedMotion={reducedMotion} />
      <CameraRig reducedMotion={reducedMotion} />
      <Cue at={warmAt} onCue={warm} />
      <Cue at={digAt} onCue={() => setDigging(true)} />
      {digging ? (
        <ChunkBoundary>
          <Suspense fallback={null}>
            <CrateScene reducedMotion={reducedMotion} onStage={onStage} onDig={onDig} onRecords={onRecords} />
          </Suspense>
        </ChunkBoundary>
      ) : null}
    </>
  );
}
