"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  CuboidCollider,
  CylinderCollider,
  InstancedRigidBodies,
  Physics,
  RigidBody,
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  type InstancedRigidBodyProps,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { mulberry32 } from "@/lib/three/wordmark";
import {
  CRATE,
  FLOOR_Y,
  RECORD_SIZE,
  SPAWN_Y,
  crateInterior,
  groupByKind,
  releaseTime,
  spawnLayout,
  type RecordKind,
  type RecordSpec,
} from "@/lib/three/crate-dig";
import type { Stage } from "@/lib/three/stage";
import { digPen, penColliders, type BoxCollider } from "@/lib/three/pen";
import { RECORD_KINDS, writeInstances, type RecordKit } from "@/components/three/crateKit";
import { playSfx } from "@/lib/sfx";

/**
 * The drop and the dig (lazy chunk — this is the only module that imports
 * @react-three/rapier, and with it ~2 MB of inlined wasm).
 *
 * Records are held weightless above the frame and let go one by one, so they
 * arrive as a cascade rather than a dump; each kind is one instanced mesh
 * whose instances are individual rigid bodies. Picking a record up turns the
 * pointer into a spring target the body chases each step — it still collides
 * while held — and letting go keeps whatever velocity it had: that's the
 * flick. A tap without a drag tosses it up instead, so touch gets a gesture
 * too.
 */

export interface RecordsPhysicsProps {
  specs: RecordSpec[];
  kit: RecordKit;
  onStage?: (stage: Stage) => void;
  onDig?: (label: string | null) => void;
}

const STEP = 1 / 60;
/** How hard a held record chases the pointer (per second) and its top speed. */
const HOLD_GAIN = 12;
const HOLD_MAX_SPEED = 11;
/** How low and high a held record may be carried (above the floor). */
const HOLD_LOW = FLOOR_Y + 0.2;
const HOLD_HIGH = FLOOR_Y + 4.5;
/** A tap tosses the record ~0.9 units up. */
const POP_SPEED = 4.2;
const TAP_MS = 280;
const TAP_PX = 8;
/** "At rest": below these speeds for this many consecutive steps. */
const QUIET_SPEED = 0.06;
const QUIET_SPIN = 0.3;
const QUIET_STEPS = 40;
/** A stack that never quite stops jittering must not hold the HUD hostage. */
const SETTLE_CAP_STEPS = 60 * 14;

const [LW, LH, LD] = RECORD_SIZE.lp;
const [SD, SH] = RECORD_SIZE.single;
const [TW, TH, TD] = RECORD_SIZE.tape;
/**
 * Rapier has no rolling friction: a 7-inch leaning on another one's edge
 * wobbles on like Euler's disk for many seconds. Discs get the damping
 * real vinyl gets from the floor; sleeves and tapes tumble freely.
 */
const ANGULAR_DAMPING: Record<RecordKind, number> = { lp: 0.4, single: 1.4, tape: 0.5 };

const COLLIDER: Record<RecordKind, ReactNode> = {
  lp: <CuboidCollider args={[LW / 2, LH / 2, LD / 2]} restitution={0.18} friction={0.65} />,
  single: <CylinderCollider args={[SH / 2, SD / 2]} restitution={0.22} friction={0.5} />,
  tape: <CuboidCollider args={[TW / 2, TH / 2, TD / 2]} restitution={0.28} friction={0.55} />,
};

/** The crate's five boards as solid colliders (the slat gaps are cosmetic). */
function CrateColliders() {
  const { width: W, height: H, depth: D, wall: T, floor: F } = CRATE;
  const halfH = (H - F) / 2;
  const y = F + halfH;
  return (
    <RigidBody type="fixed" colliders={false} position={CRATE.position}>
      <CuboidCollider args={[W / 2, F / 2, D / 2]} position={[0, F / 2, 0]} friction={0.7} />
      <CuboidCollider args={[W / 2, halfH, T / 2]} position={[0, y, D / 2 - T / 2]} />
      <CuboidCollider args={[W / 2, halfH, T / 2]} position={[0, y, -(D / 2 - T / 2)]} />
      <CuboidCollider args={[T / 2, halfH, D / 2 - T]} position={[W / 2 - T / 2, y, 0]} />
      <CuboidCollider args={[T / 2, halfH, D / 2 - T]} position={[-(W / 2 - T / 2), y, 0]} />
    </RigidBody>
  );
}

const Box = ({ box, friction }: { box: BoxCollider; friction?: number }) => (
  <CuboidCollider args={box.args} position={box.position} rotation={box.rotation} friction={friction} />
);

/**
 * The floor and the invisible pen (lib/three/pen.ts): side walls just past
 * the frame edges, a ramp under the bottom of the shot, the far wall where
 * the fog has closed — all clear of the camera's sway. A record is never
 * seen stopping against nothing, and a flick still can't lose it for good.
 * Collider shapes are fixed at creation, so the key rebuilds the pen when
 * the frame's aspect changes.
 */
function Bounds() {
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const key = aspect.toFixed(2);
  const pen = useMemo(() => penColliders(digPen(Number(key))), [key]);
  return (
    <RigidBody key={key} type="fixed" colliders={false}>
      <Box box={pen.floor} friction={0.85} />
      {[...pen.left, ...pen.right, pen.back, pen.ramp].map((box, i) => (
        <Box key={i} box={box} />
      ))}
    </RigidBody>
  );
}

interface Grab {
  body: RapierRigidBody;
  pointerId: number;
  plane: THREE.Plane;
  offset: THREE.Vector3;
  target: THREE.Vector3;
  downAt: number;
  downX: number;
  downY: number;
  travelled: number;
}

const FallingRecords = memo(function FallingRecords({ specs, kit, onStage, onDig }: RecordsPhysicsProps) {
  const get = useThree((s) => s.get);
  const groups = useMemo(() => groupByKind(specs), [specs]);
  const spawn = useMemo(() => spawnLayout(specs), [specs]);
  const slotOf = useMemo(() => {
    const slots = new Array<number>(specs.length);
    for (const kind of RECORD_KINDS) groups[kind].forEach((specIndex, slot) => (slots[specIndex] = slot));
    return slots;
  }, [groups, specs.length]);
  const instances = useMemo(() => {
    const out = { lp: [], single: [], tape: [] } as Record<RecordKind, InstancedRigidBodyProps[]>;
    for (const kind of RECORD_KINDS) {
      out[kind] = groups[kind].map((i) => ({
        key: `${specs[i].id}-${i}`,
        position: spawn[i].position,
        rotation: spawn[i].rotation,
      }));
    }
    return out;
  }, [groups, specs, spawn]);

  const lpBodies = useRef<(RapierRigidBody | null)[]>(null);
  const singleBodies = useRef<(RapierRigidBody | null)[]>(null);
  const tapeBodies = useRef<(RapierRigidBody | null)[]>(null);
  const meshes = useRef<Partial<Record<RecordKind, THREE.InstancedMesh | null>>>({});

  // Callbacks change identity with their owners; the physics loop reads the latest.
  const handlers = useRef({ onStage, onDig });
  useEffect(() => {
    handlers.current = { onStage, onDig };
  }, [onStage, onDig]);

  const sim = useRef({
    steps: 0,
    released: 0,
    quiet: 0,
    settled: false,
    landing: null as null | { body: RapierRigidBody; steps: number; quiet: number },
    rand: mulberry32(77),
  });
  const grab = useRef<Grab | null>(null);
  const scratch = useMemo(
    () => ({
      vel: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      ndc: new THREE.Vector2(),
      hit: new THREE.Vector3(),
      ray: new THREE.Raycaster(),
      floor: new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_LOW),
    }),
    [],
  );

  const bodyOf = (specIndex: number): RapierRigidBody | null => {
    const ref = { lp: lpBodies, single: singleBodies, tape: tapeBodies }[specs[specIndex].kind];
    return ref.current?.[slotOf[specIndex]] ?? null;
  };

  // Paint inks and park every record at its hold point before the first
  // frame, so nothing flashes at the origin while the bodies are created.
  useLayoutEffect(() => {
    for (const kind of RECORD_KINDS) {
      const mesh = meshes.current[kind];
      if (mesh) writeInstances(mesh, groups[kind], specs, spawn);
    }
  }, [groups, specs, spawn]);

  useEffect(() => {
    handlers.current.onStage?.("dropping");
  }, []);

  useBeforePhysicsStep(() => {
    const s = sim.current;
    s.steps++;
    const t = s.steps * STEP;
    while (s.released < specs.length && releaseTime(s.released) <= t) {
      const body = bodyOf(s.released);
      if (!body) break; // bodies are created in effects; try again next step
      body.setGravityScale(1, true);
      body.setLinvel({ x: 0, y: -1.2, z: 0 }, true);
      body.setAngvel({ x: (s.rand() - 0.5) * 5, y: (s.rand() - 0.5) * 3, z: (s.rand() - 0.5) * 5 }, true);
      s.released++;
    }

    const g = grab.current;
    if (g) {
      const p = g.body.translation();
      const v = scratch.vel.set(g.target.x - p.x, g.target.y - p.y, g.target.z - p.z).multiplyScalar(HOLD_GAIN);
      if (v.length() > HOLD_MAX_SPEED) v.setLength(HOLD_MAX_SPEED);
      g.body.setLinvel(v, true);
      const w = g.body.angvel();
      g.body.setAngvel({ x: w.x * 0.9, y: w.y * 0.9, z: w.z * 0.9 }, true);
    }
  });

  useAfterPhysicsStep(() => {
    const s = sim.current;
    // Rapier has no torsional friction, so a 7-inch that lands flat keeps
    // spinning on its face like it's on a platter (and a sleeve resting
    // tilted on the pile does the same about its tilted face). Bleed off
    // spin about each record's own thin axis once it has stopped travelling;
    // tumbles and topples (the other axes) are left alone.
    for (let i = 0; i < s.released; i++) {
      const body = bodyOf(i);
      if (!body || body.isSleeping() || grab.current?.body === body) continue;
      const v = body.linvel();
      if (Math.hypot(v.x, v.y, v.z) > 0.25) continue;
      const q = body.rotation();
      const n = scratch.axis.set(0, 1, 0).applyQuaternion(scratch.quat.set(q.x, q.y, q.z, q.w));
      const w = body.angvel();
      const spin = w.x * n.x + w.y * n.y + w.z * n.z;
      if (Math.abs(spin) < 0.02) continue;
      const k = spin * 0.08;
      body.setAngvel({ x: w.x - n.x * k, y: w.y - n.y * k, z: w.z - n.z * k }, false);
    }
    if (!s.settled) {
      let moving = s.released < specs.length ? 1 : 0;
      for (let i = 0; i < specs.length; i++) {
        const body = bodyOf(i);
        if (!body) {
          moving++;
          continue;
        }
        const p = body.translation();
        if (p.y < FLOOR_Y - 2) {
          // tunnelled through something: back above the crate, no fuss
          body.setTranslation({ x: CRATE.position[0], y: SPAWN_Y, z: CRATE.position[2] }, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        if (body.isSleeping()) continue;
        const v = body.linvel();
        const w = body.angvel();
        if (Math.hypot(v.x, v.y, v.z) > QUIET_SPEED || Math.hypot(w.x, w.y, w.z) > QUIET_SPIN) moving++;
      }
      s.quiet = moving === 0 ? s.quiet + 1 : 0;
      if (s.quiet >= QUIET_STEPS || s.steps > SETTLE_CAP_STEPS) {
        s.settled = true;
        handlers.current.onStage?.("settled");
      }
    }

    // The interface "drop" thunk, for a record the visitor let go that comes
    // to rest inside the crate (playSfx is a no-op unless sounds are on).
    const L = s.landing;
    if (L && !grab.current) {
      L.steps++;
      const v = L.body.linvel();
      L.quiet = Math.hypot(v.x, v.y, v.z) < 0.08 ? L.quiet + 1 : 0;
      if (L.quiet > 8 && L.steps > 12) {
        const p = L.body.translation();
        const { cx, cz, halfX, halfZ, floorY } = crateInterior();
        if (Math.abs(p.x - cx) < halfX && Math.abs(p.z - cz) < halfZ && p.y < floorY + CRATE.height) {
          playSfx("drop");
        }
        s.landing = null;
      } else if (L.steps > 60 * 5) {
        s.landing = null;
      }
    }
  });

  // Raycasts test each instanced mesh's cached bounding sphere first; it has
  // to follow the records or a record that moved can't be picked up.
  useFrame(() => {
    for (const kind of RECORD_KINDS) meshes.current[kind]?.computeBoundingSphere();
  });

  // Pointer tracking lives on window so a drag survives leaving the record.
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const g = grab.current;
      if (!g || ev.pointerId !== g.pointerId) return;
      const { camera, gl } = get();
      const rect = gl.domElement.getBoundingClientRect();
      scratch.ndc.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      scratch.ray.setFromCamera(scratch.ndc, camera);
      if (scratch.ray.ray.intersectPlane(g.plane, scratch.hit)) {
        g.target.copy(scratch.hit).add(g.offset);
        // Below the floor the camera-facing plane runs off under the shot, so
        // the record would slide away from the pointer (and out of frame,
        // into the pen's walls). Follow the pointer along the floor instead.
        if (g.target.y < HOLD_LOW && scratch.ray.ray.intersectPlane(scratch.floor, scratch.hit)) {
          g.target.set(scratch.hit.x + g.offset.x, HOLD_LOW, scratch.hit.z + g.offset.z);
        }
        g.target.y = Math.min(HOLD_HIGH, Math.max(HOLD_LOW, g.target.y));
      }
      g.travelled = Math.max(g.travelled, Math.hypot(ev.clientX - g.downX, ev.clientY - g.downY));
    };
    const release = (ev?: PointerEvent) => {
      const g = grab.current;
      if (!g || (ev && ev.pointerId !== g.pointerId)) return;
      grab.current = null;
      get().gl.domElement.style.cursor = "";
      const tapped = performance.now() - g.downAt < TAP_MS && g.travelled < TAP_PX;
      if (tapped) {
        const r = sim.current.rand;
        const v = g.body.linvel();
        g.body.setLinvel({ x: v.x * 0.3, y: POP_SPEED, z: v.z * 0.3 }, true);
        g.body.setAngvel({ x: (r() - 0.5) * 7, y: (r() - 0.5) * 4, z: (r() - 0.5) * 7 }, true);
      }
      // A drag keeps the velocity the chase gave it — that's the flick.
      sim.current.landing = { body: g.body, steps: 0, quiet: 0 };
      handlers.current.onDig?.(null);
    };
    const blur = () => release();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", blur);
      get().gl.domElement.style.cursor = "";
      // unmounted mid-hold (e.g. reduced motion switched on): nothing is held now
      if (grab.current) {
        grab.current = null;
        handlers.current.onDig?.(null);
      }
    };
  }, [get, scratch]);

  const pickUp = (kind: RecordKind) => (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined || grab.current) return;
    const specIndex = groups[kind][e.instanceId];
    const body = specIndex === undefined ? null : bodyOf(specIndex);
    if (!body) return;
    e.stopPropagation();
    const { camera, gl } = get();
    const p = body.translation();
    const at = new THREE.Vector3(p.x, p.y, p.z);
    grab.current = {
      body,
      pointerId: e.nativeEvent.pointerId,
      // drag in a camera-facing plane through the grab point: up is up, sideways is sideways
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), e.point),
      offset: at.clone().sub(e.point),
      target: at,
      downAt: performance.now(),
      downX: e.nativeEvent.clientX,
      downY: e.nativeEvent.clientY,
      travelled: 0,
    };
    body.wakeUp();
    gl.domElement.style.cursor = "grabbing";
    handlers.current.onDig?.(specs[specIndex].label);
  };

  const hover = (on: boolean) => () => {
    if (!grab.current) get().gl.domElement.style.cursor = on ? "grab" : "";
  };

  const bodyRefs = { lp: lpBodies, single: singleBodies, tape: tapeBodies };

  return (
    <>
      {RECORD_KINDS.map((kind) =>
        groups[kind].length ? (
          <InstancedRigidBodies
            key={kind}
            ref={bodyRefs[kind]}
            instances={instances[kind]}
            colliders={false}
            colliderNodes={[COLLIDER[kind]]}
            gravityScale={0}
            ccd
            linearDamping={0.05}
            angularDamping={ANGULAR_DAMPING[kind]}
          >
            <instancedMesh
              ref={(m: THREE.InstancedMesh | null) => {
                meshes.current[kind] = m;
              }}
              args={[kit.geometry[kind], kit.material[kind], groups[kind].length]}
              frustumCulled={false}
              onPointerDown={pickUp(kind)}
              onPointerOver={hover(true)}
              onPointerOut={hover(false)}
            />
          </InstancedRigidBodies>
        ) : null,
      )}
    </>
  );
});

function RecordsPhysics(props: RecordsPhysicsProps) {
  return (
    <Physics colliders={false} timeStep={STEP} numSolverIterations={6}>
      <Bounds />
      <CrateColliders />
      <FallingRecords {...props} />
    </Physics>
  );
}

export default memo(RecordsPhysics);
