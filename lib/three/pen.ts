/**
 * Pulsar — the physics pen around "dig the crate" (pure geometry)
 *
 * Rapier needs walls or one hard flick loses a record for good, but the
 * visitor must never watch a record stop against nothing. So the pen is cut
 * from the camera's frame, not sized around the crate:
 *
 *   sides  vertical, standing just past the left/right frame edges where
 *          they meet the floor. The frame looks down, so verticals lean out
 *          of shot as they rise: outside at the floor is outside all the way up.
 *   near   a steep ramp lying just under the frame's bottom plane, so it is
 *          out of shot at every height and slides a record back into view.
 *   far    the one wall the frame does reach (it sees the floor to the
 *          horizon), so it stands where the curtain's fog has swallowed
 *          anything leaning on it.
 *
 * Every wall clears the whole sway (SWAY), not just the resting frame.
 * The colliders are plain data so the tests can project them through the
 * camera; RecordsPhysics only turns them into Rapier cuboids.
 */

import {
  DIG_HALF_WIDTH,
  DIG_POSE,
  FLOOR_Y,
  FOV,
  SWAY,
  curtainFog,
  fitPose,
  floorEdgeX,
  floorEdgeZ,
  projectPoint,
  type Pose,
  type Vec3,
} from "./stage";

export const PEN = {
  /** How far past the (swayed) frame edge the side walls stand. A record
   *  resting on one is cut by the frame edge, its contact out of shot, and
   *  the visible part is still there to grab. */
  margin: 0.25,
  /** Longest side-wall segment. Each frame edge is a straight floor line but
   *  the sway's outermost edge bends, so a single straight wall would stand
   *  1–1.5 units further out than needed mid-frame. */
  segment: 3,
  /** The ramp's distance outside the frame's bottom plane. */
  rampMargin: 0.5,
  /** Wall height above the floor: clears the highest flick (~11 up). */
  height: 12,
  /** Fog that hides a record leaning on the far wall. */
  hiddenFog: 0.95,
  /** Highest a record resting on the far wall reaches (a sleeve on edge, a bounce). */
  contact: 1.5,
  /** Half the wall thickness; walls grow outward from their inner face. */
  halfThickness: 0.25,
} as const;

/** The resting dig frame plus the four corners of its sway. */
export function swayPoses(pose: Pose): Pose[] {
  const [x, y, z] = pose.position;
  const out: Pose[] = [pose];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      out.push({ position: [x + sx * SWAY.x, y + sy * SWAY.y, z], target: pose.target });
    }
  }
  return out;
}

type Vec2 = [number, number];

export interface Pen {
  /** The camera frame the pen was cut for (before sway). */
  pose: Pose;
  /** Inner-face floor polylines of the side walls, [x, z] knots from back to end. */
  left: Vec2[];
  right: Vec2[];
  /** z of the far wall's inner face. */
  back: number;
  /** The ramp's inner face meets the floor at z = footZ, rising toward the camera at `slope` (radians). */
  footZ: number;
  slope: number;
  /** z where the side walls end: the top of the ramp (or short of the camera's feet). */
  end: number;
}

/** Inverse of smoothstep on 0..1. */
function unSmoothstep(y: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
}

export function digPen(aspect: number, fovDeg = FOV): Pen {
  const pose = fitPose(DIG_POSE, aspect, fovDeg, DIG_HALF_WIDTH);
  const poses = swayPoses(pose);
  const halfFov = ((fovDeg / 2) * Math.PI) / 180;
  const [, py, pz] = pose.position;
  const [, ty, tz] = pose.target;
  // the frame's bottom ray, from horizontal
  const slope = Math.min(Math.PI / 2 - 0.05, Math.atan2(py - ty, pz - tz) + halfFov);

  /** The outermost frame edge over the whole sway, at depth z (null: behind a camera). */
  const edge = (z: number, side: 1 | -1): number | null => {
    let out: number | null = null;
    for (const p of poses) {
      const x = floorEdgeX(p, aspect, fovDeg, FLOOR_Y, z, side);
      if (x === null) return null;
      out = out === null ? x : side > 0 ? Math.max(out, x) : Math.min(out, x);
    }
    return out;
  };

  // Ramp foot: the nearest the frame's bottom edge comes over the sway. That
  // edge is a straight floor line, so its extremes are at the frame corners.
  const centreFoot = Math.max(...poses.map((p) => floorEdgeZ(p, fovDeg, FLOOR_Y, 0) ?? pz));
  const reach = Math.max(Math.abs(edge(centreFoot, -1) ?? 0), Math.abs(edge(centreFoot, 1) ?? 0)) + 1;
  let bottom = -Infinity;
  for (const p of poses) {
    for (const x of [-reach, reach]) bottom = Math.max(bottom, floorEdgeZ(p, fovDeg, FLOOR_Y, x) ?? pz);
  }
  const footZ = bottom + PEN.rampMargin / Math.sin(slope);

  // Side walls run to the top of the ramp, but stop short of where the floor
  // passes under a camera (beyond that a frame edge has no floor line).
  let end = footZ + PEN.height / Math.tan(slope);
  while (end > footZ && (edge(end, -1) === null || edge(end, 1) === null)) end -= 0.25;

  // Far wall: every point a resting record can touch is at least `hiddenFog`
  // fogged, for every camera in the sway. Depth is linear in z (and in x, for
  // a swayed camera), so solve at the wall's ends and take the farthest.
  const fogClosed = (p: Pose, x: number): number => {
    const { near, far } = curtainFog(1, Math.hypot(...p.position));
    const need = near + unSmoothstep(PEN.hiddenFog) * (far - near);
    const y = FLOOR_Y + PEN.contact;
    const d0 = projectPoint(p, aspect, fovDeg, [x, y, 0]).depth;
    const perZ = d0 - projectPoint(p, aspect, fovDeg, [x, y, -1]).depth; // < 0: deeper going -z
    return (need - d0) / perZ;
  };
  let back = Math.min(...poses.map((p) => fogClosed(p, 0)));
  for (let i = 0; i < 4; i++) {
    const xs = [0, (edge(back, -1) ?? 0) - PEN.margin, (edge(back, 1) ?? 0) + PEN.margin];
    back = Math.min(...poses.flatMap((p) => xs.map((x) => fogClosed(p, x))));
  }

  // Between two knots every swayed frame edge is a straight line under the
  // chord joining their outermost points, so the polyline clears them all.
  const segments = Math.max(1, Math.ceil((end - back) / PEN.segment));
  const knots = Array.from({ length: segments + 1 }, (_, i) => back + ((end - back) * i) / segments);
  const side = (s: 1 | -1): Vec2[] => knots.map((z) => [(edge(z, s) ?? 0) + s * PEN.margin, z]);
  return { pose, left: side(-1), right: side(1), back, footZ, slope, end };
}

/** x of a side wall's inner face at depth z (clamped to the wall's ends). */
export function penSideX(line: readonly Vec2[], z: number): number {
  let i = 0;
  while (i < line.length - 2 && z > line[i + 1][1]) i++;
  const [x0, z0] = line[i];
  const [x1, z1] = line[i + 1];
  const t = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
  return x0 + (x1 - x0) * t;
}

export interface BoxCollider {
  /** Half extents, as Rapier's CuboidCollider takes them. */
  args: Vec3;
  position: Vec3;
  /** Euler XYZ, radians. */
  rotation: Vec3;
}

export interface PenColliders {
  floor: BoxCollider;
  /** One box per side-wall segment. */
  left: BoxCollider[];
  right: BoxCollider[];
  back: BoxCollider;
  ramp: BoxCollider;
}

/** A vertical wall whose inner face stands on the floor line a → b, growing outward (`out` = ±1 in x). */
function wallSegment(a: Vec2, b: Vec2, out: 1 | -1): BoxCollider {
  const T = PEN.halfThickness;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  // the box's local x after the yaw: (cos, 0, -sin) — flipped to point outward
  let nx = Math.cos(yaw);
  let nz = -Math.sin(yaw);
  if (Math.sign(nx) !== out) {
    nx = -nx;
    nz = -nz;
  }
  return {
    args: [T, PEN.height / 2, len / 2],
    position: [(a[0] + b[0]) / 2 + nx * T, FLOOR_Y + PEN.height / 2, (a[1] + b[1]) / 2 + nz * T],
    rotation: [0, yaw, 0],
  };
}

const sideWall = (line: readonly Vec2[], out: 1 | -1): BoxCollider[] =>
  line.slice(1).map((b, i) => wallSegment(line[i], b, out));

export function penColliders(pen: Pen): PenColliders {
  const T = PEN.halfThickness;
  const H = PEN.height;
  const wide = Math.max(...pen.left.map(([x]) => -x), ...pen.right.map(([x]) => x)) + 2;

  // The ramp: local y runs up the slope toward the camera, local z is its
  // outward normal. It starts a little under the floor so there's no seam.
  const s: Vec3 = [0, Math.sin(pen.slope), Math.cos(pen.slope)];
  const n: Vec3 = [0, -Math.cos(pen.slope), Math.sin(pen.slope)];
  const under = 0.5;
  const rampLen = under + H / Math.sin(pen.slope);
  const along = rampLen / 2 - under;
  const rampHalfX = Math.max(Math.abs(penSideX(pen.left, pen.footZ)), Math.abs(penSideX(pen.right, pen.footZ))) + 1;

  return {
    floor: {
      args: [wide, 0.5, (pen.end - pen.back) / 2 + 2],
      position: [0, FLOOR_Y - 0.5, (pen.end + pen.back) / 2],
      rotation: [0, 0, 0],
    },
    left: sideWall(pen.left, -1),
    right: sideWall(pen.right, 1),
    back: {
      args: [wide, H / 2, T],
      position: [0, FLOOR_Y + H / 2, pen.back - T],
      rotation: [0, 0, 0],
    },
    ramp: {
      args: [rampHalfX, rampLen / 2, T],
      position: [
        0,
        FLOOR_Y + s[1] * along + n[1] * T,
        pen.footZ + s[2] * along + n[2] * T,
      ],
      rotation: [Math.PI / 2 - pen.slope, 0, 0],
    },
  };
}
