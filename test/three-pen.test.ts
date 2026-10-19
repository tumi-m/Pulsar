import { describe, it, expect } from "vitest";
import * as THREE from "three";
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
  fogAmount,
  frameNearFloorZ,
  projectPoint,
  visibleHalfWidth,
  type Pose,
  type Vec3,
} from "@/lib/three/stage";
import { PEN, digPen, penColliders, penSideX, swayPoses, type BoxCollider } from "@/lib/three/pen";
import { CRATE, buildRecordSpecs, spawnLayout } from "@/lib/three/crate-dig";

const ASPECTS: Record<string, number> = {
  "16:10": 1280 / 800,
  "16:9": 1920 / 1080,
  "4:3": 1024 / 768,
  "21:9": 2560 / 1080,
  "phone portrait": 390 / 844,
  "phone landscape": 844 / 390,
};

/** The frames CameraRig actually shows once it has settled: the sway path, plus its corners. */
function swayPath(pose: Pose): Pose[] {
  const out = swayPoses(pose);
  for (let t = 0; t < 160; t += 2.5) {
    out.push({
      position: [
        pose.position[0] + Math.sin(t * 0.05) * SWAY.x,
        pose.position[1] + Math.cos(t * 0.04) * SWAY.y,
        pose.position[2],
      ],
      target: pose.target,
    });
  }
  return out;
}

const NEAR = 0.1; // R3F's default camera near plane
const inShot = (pose: Pose, aspect: number, p: Vec3) => {
  const v = projectPoint(pose, aspect, FOV, p);
  return v.depth > NEAR && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
};

const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

function toLocal(box: BoxCollider, p: Vec3): THREE.Vector3 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...box.rotation));
  return new THREE.Vector3(...p).sub(new THREE.Vector3(...box.position)).applyQuaternion(q.invert());
}
function toWorld(box: BoxCollider, local: Vec3): Vec3 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...box.rotation));
  const v = new THREE.Vector3(...local).applyQuaternion(q).add(new THREE.Vector3(...box.position));
  return [v.x, v.y, v.z];
}

describe("projection helpers", () => {
  const aspect = 1.6;

  it("puts the target dead centre and the visible half-width on the frame edge", () => {
    const c = projectPoint(DIG_POSE, aspect, FOV, DIG_POSE.target);
    expect(c.x).toBeCloseTo(0, 9);
    expect(c.y).toBeCloseTo(0, 9);
    const d = Math.hypot(...DIG_POSE.position.map((v, i) => v - DIG_POSE.target[i]));
    expect(c.depth).toBeCloseTo(d, 9);
    // DIG_POSE looks straight down -z (no yaw), so right is +x at the target
    const edge: Vec3 = [visibleHalfWidth(aspect, FOV, d), DIG_POSE.target[1], DIG_POSE.target[2]];
    expect(projectPoint(DIG_POSE, aspect, FOV, edge).x).toBeCloseTo(1, 9);
  });

  it("solves the floor's frame edges, swayed or not", () => {
    for (const pose of swayPoses(DIG_POSE)) {
      for (const z of [-12, 0.6, 5]) {
        for (const side of [-1, 1] as const) {
          const x = floorEdgeX(pose, aspect, FOV, FLOOR_Y, z, side)!;
          expect(projectPoint(pose, aspect, FOV, [x, FLOOR_Y, z]).x).toBeCloseTo(side, 9);
        }
      }
      for (const x of [-4, 0, 4]) {
        const z = floorEdgeZ(pose, FOV, FLOOR_Y, x)!;
        expect(projectPoint(pose, aspect, FOV, [x, FLOOR_Y, z]).y).toBeCloseTo(-1, 9);
      }
    }
    // on the centre line of an unswayed frame it is frameNearFloorZ
    expect(floorEdgeZ(DIG_POSE, FOV, FLOOR_Y, 0)).toBeCloseTo(frameNearFloorZ(DIG_POSE, FOV, FLOOR_Y), 9);
  });

  it("reports floor behind the camera as null", () => {
    expect(floorEdgeX(DIG_POSE, aspect, FOV, FLOOR_Y, DIG_POSE.position[2] + 30, 1)).toBeNull();
  });

  it("matches three's smoothstep fog", () => {
    expect(fogAmount(4, 5, 10)).toBe(0);
    expect(fogAmount(7.5, 5, 10)).toBeCloseTo(0.5, 9);
    expect(fogAmount(12, 5, 10)).toBe(1);
  });
});

describe.each(Object.entries(ASPECTS))("dig pen at %s", (_, aspect) => {
  const pen = digPen(aspect);
  const boxes = penColliders(pen);
  const frames = swayPath(pen.pose);
  const top = FLOOR_Y + PEN.height;

  it("is cut for the frame the camera rig uses", () => {
    expect(pen.pose).toEqual(fitPose(DIG_POSE, aspect, FOV, DIG_HALF_WIDTH));
  });

  it("keeps both side walls out of every swayed frame, floor to top", () => {
    const seen: Vec3[] = [];
    for (const line of [pen.left, pen.right]) {
      const zs = line.flatMap(([, z], i) => (i ? range(line[i - 1][1], z, 6) : [z]));
      for (const z of zs) {
        const x = penSideX(line, z);
        for (const y of range(FLOOR_Y, top, 24)) {
          if (frames.some((pose) => inShot(pose, aspect, [x, y, z]))) seen.push([x, y, z]);
        }
      }
    }
    expect(seen).toEqual([]);
  });

  it("keeps the near ramp out of every swayed frame", () => {
    const halfX = boxes.ramp.args[0];
    const len = PEN.height / Math.sin(pen.slope);
    const seen: Vec3[] = [];
    for (const l of range(0, len, 30)) {
      const y = FLOOR_Y + Math.sin(pen.slope) * l;
      const z = pen.footZ + Math.cos(pen.slope) * l;
      for (const x of range(-halfX, halfX, 24)) {
        if (frames.some((pose) => inShot(pose, aspect, [x, y, z]))) seen.push([x, y, z]);
      }
    }
    expect(seen).toEqual([]);
  });

  it("stands the far wall where the fog hides anything leaning on it", () => {
    const halfX = boxes.back.args[0];
    let worst = 1;
    for (const pose of frames) {
      const { near, far } = curtainFog(1, Math.hypot(...pose.position));
      for (const x of range(-halfX, halfX, 40)) {
        for (const y of range(FLOOR_Y, FLOOR_Y + PEN.contact, 6)) {
          const p: Vec3 = [x, y, pen.back];
          if (!inShot(pose, aspect, p)) continue;
          worst = Math.min(worst, fogAmount(projectPoint(pose, aspect, FOV, p).depth, near, far));
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(PEN.hiddenFog - 1e-6);
  });

  it("hugs the frame: no wall stands far past the edge the sway can reach", () => {
    for (const z of range(pen.back, pen.footZ, 20)) {
      for (const [line, side] of [
        [pen.left, -1],
        [pen.right, 1],
      ] as const) {
        const reach = Math.max(...frames.map((p) => side * floorEdgeX(p, aspect, FOV, FLOOR_Y, z, side)!));
        const wall = side * penSideX(line, z);
        expect(wall).toBeGreaterThan(reach);
        expect(wall - reach).toBeLessThan(PEN.margin + 0.15);
      }
    }
  });

  it("builds each collider with its inner face on the pen line, growing outward", () => {
    const T = PEN.halfThickness;
    for (const [line, walls, out] of [
      [pen.left, boxes.left, -1],
      [pen.right, boxes.right, 1],
    ] as const) {
      expect(walls).toHaveLength(line.length - 1);
      walls.forEach((box, i) => {
        const [a, b] = [line[i], line[i + 1]];
        const mid: Vec3 = [(a[0] + b[0]) / 2, FLOOR_Y + 1, (a[1] + b[1]) / 2];
        expect(Math.abs(toLocal(box, mid).x)).toBeCloseTo(T, 6);
        // a hair outward is inside the wall, a hair inward is free
        expect(Math.abs(toLocal(box, [mid[0] + out * 0.01, mid[1], mid[2]]).x)).toBeLessThan(T);
        expect(Math.abs(toLocal(box, [mid[0] - out * 0.01, mid[1], mid[2]]).x)).toBeGreaterThan(T);
        // and spans floor to top
        expect(box.position[1] - box.args[1]).toBeCloseTo(FLOOR_Y, 6);
        expect(box.position[1] + box.args[1]).toBeCloseTo(top, 6);
      });
    }
    // the ramp's inner face (local -z) holds its foot line and rises toward the camera
    const foot = toLocal(boxes.ramp, [0, FLOOR_Y, pen.footZ]);
    expect(foot.z).toBeCloseTo(-T, 6);
    const up = toWorld(boxes.ramp, [0, boxes.ramp.args[1], -T]);
    expect(up[1]).toBeGreaterThan(FLOOR_Y + PEN.height - 0.01);
    expect(up[2]).toBeGreaterThan(pen.footZ);
    // the far wall's inner face is at pen.back
    expect(boxes.back.position[2] + boxes.back.args[2]).toBeCloseTo(pen.back, 6);
  });

  it("holds the whole stage: the crate, the drop and the floor in shot", () => {
    const inside = (x: number, z: number, pad = 0) =>
      z > pen.back + pad && z < pen.footZ - pad && x > penSideX(pen.left, z) + pad && x < penSideX(pen.right, z) - pad;
    const [cx, , cz] = CRATE.position;
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) expect(inside(cx + (dx * CRATE.width) / 2, cz + (dz * CRATE.depth) / 2, 0.5)).toBe(true);
    }
    for (const s of spawnLayout(buildRecordSpecs([], { min: 24 }))) {
      expect(inside(s.position[0], s.position[2], 0.4)).toBe(true);
    }
    // every floor point the resting frame shows (short of the fog) is playable
    const z0 = frameNearFloorZ(pen.pose, FOV, FLOOR_Y);
    for (const z of range(-8, z0 - 0.01, 12)) {
      for (const side of [-1, 1] as const) {
        const x = floorEdgeX(pen.pose, aspect, FOV, FLOOR_Y, z, side)!;
        expect(inside(x * 0.999, z)).toBe(true);
      }
    }
  });

  it("lays a floor under all of it", () => {
    const f = boxes.floor;
    expect(f.position[1] + f.args[1]).toBeCloseTo(FLOOR_Y, 6);
    expect(f.position[2] - f.args[2]).toBeLessThan(pen.back);
    expect(f.position[2] + f.args[2]).toBeGreaterThan(pen.end);
    const widest = Math.max(...pen.left.map(([x]) => -x), ...pen.right.map(([x]) => x));
    expect(f.args[0]).toBeGreaterThan(widest);
  });
});

describe("the old bug", () => {
  it("no longer walls a 16:10 frame in at x = ±4.85", () => {
    const pen = digPen(1280 / 800);
    const z = CRATE.position[2];
    expect(penSideX(pen.right, z)).toBeGreaterThan(9.5);
    expect(penSideX(pen.left, z)).toBeLessThan(-9.5);
    // and at the bottom edge of the frame, where the old walls were nearest the middle
    const zb = frameNearFloorZ(pen.pose, FOV, FLOOR_Y) - 0.1;
    expect(penSideX(pen.right, zb)).toBeGreaterThan(5.7);
  });
});
