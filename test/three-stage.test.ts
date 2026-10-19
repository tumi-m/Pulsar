import { describe, it, expect } from "vitest";
import {
  ABERRATION_PEAK,
  DIG_HALF_WIDTH,
  DIG_POSE,
  FOV,
  OPENING_POSE,
  SEQUENCE,
  curtainAberration,
  FLOOR_Y,
  fitPose,
  fitScale,
  frameNearFloorZ,
  lerpPose,
  visibleHalfWidth,
} from "@/lib/three/stage";
import { buildConstellation, constellationHalfWidth } from "@/lib/three/wordmark";

const dist = (p: { position: number[]; target: number[] }) =>
  Math.hypot(...p.position.map((v, i) => v - p.target[i]));

describe("sequence", () => {
  it("runs anticipation → wordmark → curtain → set-piece in order", () => {
    expect(SEQUENCE.wordmark).toBeLessThan(SEQUENCE.curtain);
    expect(SEQUENCE.curtain).toBeLessThan(SEQUENCE.setPiece);
    // the set-piece waits for the curtain to be mostly open
    expect(SEQUENCE.setPiece).toBeGreaterThan(SEQUENCE.curtain + SEQUENCE.curtainSeconds * 0.6);
  });
});

describe("fitPose", () => {
  it("leaves the desktop crate frame alone", () => {
    expect(fitPose(DIG_POSE, 1280 / 800, FOV, DIG_HALF_WIDTH)).toEqual(DIG_POSE);
  });

  it("backs a portrait phone off along the same view axis until the crate fits", () => {
    const aspect = 390 / 844;
    const fitted = fitPose(DIG_POSE, aspect, FOV, DIG_HALF_WIDTH);
    expect(fitted.target).toEqual(DIG_POSE.target);
    expect(visibleHalfWidth(aspect, FOV, dist(fitted))).toBeCloseTo(DIG_HALF_WIDTH, 6);
    // same direction, just further away
    const dir = (p: typeof fitted) => p.position.map((v, i) => (v - p.target[i]) / dist(p));
    dir(fitted).forEach((v, i) => expect(v).toBeCloseTo(dir(DIG_POSE)[i], 6));
  });

  it("survives a zero-height viewport", () => {
    expect(fitPose(DIG_POSE, 0, FOV, DIG_HALF_WIDTH)).toEqual(DIG_POSE);
  });
});

describe("fitScale", () => {
  // the real wordmark is rasterised on a canvas; a box of the same width stands in
  const fake = buildConstellation(
    [
      { x: -1.5, y: 0 },
      { x: 1.5, y: 0 },
    ],
    { scale: 4.4 },
  );
  const half = constellationHalfWidth(fake);

  it("measures the widest letter", () => {
    expect(half).toBeCloseTo(6.6, 5);
  });

  it("keeps the desktop wordmark at full size and shrinks it on a phone", () => {
    expect(fitScale(1280 / 800, FOV, 8, half)).toBe(1);
    const phone = fitScale(390 / 844, FOV, 8, half);
    expect(phone).toBeLessThan(0.4);
    // fitted: 90% of the visible width
    expect(half * phone).toBeCloseTo(visibleHalfWidth(390 / 844, FOV, 8) * 0.9, 6);
  });
});

describe("frameNearFloorZ", () => {
  it("finds where the bottom of the crate frame meets the floor — in front of the crate", () => {
    const z = frameNearFloorZ(DIG_POSE, FOV, FLOOR_Y);
    expect(z).toBeGreaterThan(DIG_POSE.target[2] + 2);
    expect(z).toBeLessThan(DIG_POSE.position[2]);
    // the ray from the camera at (pitch + half-fov) lands exactly there
    const [, py, pz] = DIG_POSE.position;
    const pitch = Math.atan2(py - DIG_POSE.target[1], pz - DIG_POSE.target[2]);
    expect((py - FLOOR_Y) / (pz - z)).toBeCloseTo(Math.tan(pitch + Math.PI / 6), 6);
  });

  it("moves the near wall forward when a phone's camera backs off", () => {
    const phone = fitPose(DIG_POSE, 390 / 844, FOV, DIG_HALF_WIDTH);
    expect(frameNearFloorZ(phone, FOV, FLOOR_Y)).toBeGreaterThan(frameNearFloorZ(DIG_POSE, FOV, FLOOR_Y));
  });
});

describe("lerpPose", () => {
  it("clamps and interpolates both position and target", () => {
    expect(lerpPose(OPENING_POSE, DIG_POSE, -1)).toEqual(OPENING_POSE);
    expect(lerpPose(OPENING_POSE, DIG_POSE, 2)).toEqual(DIG_POSE);
    const mid = lerpPose(OPENING_POSE, DIG_POSE, 0.5);
    expect(mid.position[1]).toBeCloseTo((OPENING_POSE.position[1] + DIG_POSE.position[1]) / 2);
    expect(mid.target[1]).toBeCloseTo((OPENING_POSE.target[1] + DIG_POSE.target[1]) / 2);
  });
});

describe("curtainAberration", () => {
  const mid = SEQUENCE.curtain + SEQUENCE.curtainSeconds / 2;

  it("swells across the curtain only", () => {
    expect(curtainAberration(0)).toBe(0);
    expect(curtainAberration(SEQUENCE.curtain)).toBe(0);
    expect(curtainAberration(mid)).toBeCloseTo(ABERRATION_PEAK, 8);
    expect(curtainAberration(SEQUENCE.curtain + SEQUENCE.curtainSeconds)).toBe(0);
    expect(curtainAberration(SEQUENCE.setPiece + 10)).toBe(0);
  });

  it("is zero for reduced motion", () => {
    expect(curtainAberration(mid, true)).toBe(0);
  });
});
