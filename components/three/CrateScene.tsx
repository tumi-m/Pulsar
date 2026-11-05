"use client";

import { Suspense, lazy, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  CRATE,
  CRATE_WOOD,
  buildRecordSpecs,
  groupByKind,
  isHouseRecord,
  readCrateReleases,
  restLayout,
  type RecordKind,
  type RecordSpec,
} from "@/lib/three/crate-dig";
import type { Stage } from "@/lib/three/stage";
import {
  RECORD_KINDS,
  blobShadowTexture,
  buildCrateGeometry,
  buildRecordKit,
  writeInstances,
  type RecordKit,
} from "@/components/three/crateKit";
import { loadRecordsPhysics } from "@/components/three/lazy";
import { ChunkBoundary } from "@/components/three/ChunkBoundary";

/**
 * "Dig the crate" — the set-piece after the wordmark lands (lazy chunk).
 *
 * The crate, its lights and the record artwork live here; the falling is a
 * further chunk (RecordsPhysics) because rapier's wasm is ~2 MB and the
 * reduced-motion form never needs it: records are simply placed where a
 * drop would have left them. Until the physics arrives the crate stands
 * empty on the grid — content first, never a blank wait.
 */

const RecordsPhysics = lazy(loadRecordsPhysics);

export interface CrateSceneProps {
  reducedMotion: boolean;
  onStage?: (stage: Stage) => void;
  /** A record was picked up (label) — or nothing is held (null). */
  onDig?: (label: string | null) => void;
  /** The visitor's own records in the crate (labels; house padding left out). */
  onRecords?: (labels: string[]) => void;
}

/** The visitor's own crate, read once; storage can be blocked, so never trust it. */
function readSpecs(): RecordSpec[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("pulsar_crates_v2");
  } catch {
    /* private mode / blocked storage — house records it is */
  }
  return buildRecordSpecs(readCrateReleases(raw));
}

function Crate() {
  const geometry = useMemo(() => buildCrateGeometry(), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: CRATE_WOOD, vertexColors: true, roughness: 0.86 }),
    [],
  );
  const shadowTex = useMemo(() => blobShadowTexture(), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      shadowTex.dispose();
    },
    [geometry, material, shadowTex],
  );

  return (
    <group position={CRATE.position}>
      <mesh geometry={geometry} material={material} />
      {/* contact shadow: just above the grid so it never z-fights it */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0]} renderOrder={-1}>
        <planeGeometry args={[CRATE.width * 2.1, CRATE.depth * 2.4]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

type StillRecordsProps = { specs: RecordSpec[]; kit: RecordKit } & Pick<CrateSceneProps, "onStage" | "onDig">;

/** Reduced motion: the records where the drop would have left them, still. */
function StillRecords({ specs, kit, onStage, onDig }: StillRecordsProps) {
  const groups = useMemo(() => groupByKind(specs), [specs]);
  const rest = useMemo(() => restLayout(specs), [specs]);
  const meshes = useRef<Partial<Record<RecordKind, THREE.InstancedMesh | null>>>({});
  const pressed = useRef(false);

  useLayoutEffect(() => {
    for (const kind of RECORD_KINDS) {
      const mesh = meshes.current[kind];
      if (mesh) writeInstances(mesh, groups[kind], specs, rest);
    }
  }, [groups, specs, rest]);

  useEffect(() => {
    onStage?.("static");
  }, [onStage]);

  // A tap names the record — no lift, no travel. It counts as held while the
  // finger is down, the same contract as the physics form, so the page can
  // linger the label and then bring its hint back.
  const pick = (kind: RecordKind) => (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined) return;
    const label = specs[groups[kind][e.instanceId]]?.label;
    if (!label) return;
    e.stopPropagation();
    pressed.current = true;
    onDig?.(label);
  };
  useEffect(() => {
    const up = () => {
      if (!pressed.current) return;
      pressed.current = false;
      onDig?.(null);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      up();
    };
  }, [onDig]);

  return (
    <>
      {RECORD_KINDS.map((kind) =>
        groups[kind].length ? (
          <instancedMesh
            key={kind}
            ref={(m: THREE.InstancedMesh | null) => {
              meshes.current[kind] = m;
            }}
            args={[kit.geometry[kind], kit.material[kind], groups[kind].length]}
            onPointerDown={pick(kind)}
          />
        ) : null,
      )}
    </>
  );
}

function CrateScene({ reducedMotion, onStage, onDig, onRecords }: CrateSceneProps) {
  const specs = useMemo(() => readSpecs(), []);
  const kit = useMemo(() => buildRecordKit(), []);
  useEffect(() => () => kit.dispose(), [kit]);

  useEffect(() => {
    onRecords?.(specs.filter((s) => !isHouseRecord(s)).map((s) => s.label));
  }, [specs, onRecords]);

  return (
    <group>
      {/* Key light warm and high, a TPS-blue rim from behind. Tuned so the
          brightest ink (sport yellow) stays under the bloom threshold. */}
      <hemisphereLight args={["#dfe6ee", "#1a2027", 1.1]} />
      <directionalLight position={[2.5, 6, 5]} intensity={2.3} color="#fff1e0" />
      <directionalLight position={[-3, 2.5, -4]} intensity={0.9} color="#4e86c7" />
      <Crate />
      {reducedMotion ? (
        <StillRecords specs={specs} kit={kit} onStage={onStage} onDig={onDig} />
      ) : (
        // no physics chunk (or no wasm)? the records still arrive, settled
        <ChunkBoundary fallback={<StillRecords specs={specs} kit={kit} onStage={onStage} onDig={onDig} />}>
          <Suspense fallback={null}>
            <RecordsPhysics specs={specs} kit={kit} onStage={onStage} onDig={onDig} />
          </Suspense>
        </ChunkBoundary>
      )}
    </group>
  );
}

export default memo(CrateScene);
