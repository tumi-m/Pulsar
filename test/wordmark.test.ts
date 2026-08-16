import { describe, it, expect } from "vitest";
import {
  AUTHORITY,
  buildConstellation,
  cubicBezier,
  mulberry32,
  sampleAlphaMask,
  sampleWordmark,
} from "@/lib/three/wordmark";

describe("cubicBezier", () => {
  it("is exactly linear for (0,0,1,1)", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(linear(t)).toBeCloseTo(t, 8);
    }
  });

  it("clamps outside [0,1]", () => {
    expect(AUTHORITY(-1)).toBe(0);
    expect(AUTHORITY(2)).toBe(1);
  });

  it("hits the endpoints exactly", () => {
    expect(AUTHORITY(0)).toBe(0);
    expect(AUTHORITY(1)).toBe(1);
  });

  it("AUTHORITY is a monotonic ease-out (fast start, gentle settle)", () => {
    let prev = AUTHORITY(0);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const v = AUTHORITY(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(AUTHORITY(0.25)).toBeGreaterThan(0.6); // most of the travel up front
  });
});

describe("sampleAlphaMask", () => {
  function rgba(width: number, height: number, opaque: (x: number, y: number) => boolean) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (opaque(x, y)) data[(y * width + x) * 4 + 3] = 0xff;
      }
    }
    return data;
  }

  it("samples only opaque pixels and normalises to centred coordinates", () => {
    // 10x10, only the exact centre pixel opaque, step 1
    const data = rgba(10, 10, (x, y) => x === 5 && y === 5);
    const pts = sampleAlphaMask(10, 10, data, { step: 1 });
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(0, 6);
    expect(pts[0].y).toBeCloseTo(0, 6);
  });

  it("flips y so up is positive", () => {
    const data = rgba(10, 10, (x, y) => x === 0 && y === 0);
    const pts = sampleAlphaMask(10, 10, data, { step: 1 });
    expect(pts[0].y).toBeCloseTo(0.5, 6); // top row → +0.5
  });

  it("caps the point count with an even spread", () => {
    const data = rgba(20, 20, () => true);
    const pts = sampleAlphaMask(20, 20, data, { step: 1, maxPoints: 10 });
    expect(pts).toHaveLength(10);
  });

  it("returns empty for a fully transparent mask", () => {
    expect(sampleAlphaMask(4, 4, new Uint8ClampedArray(4 * 4 * 4))).toHaveLength(0);
  });
});

describe("sampleWordmark", () => {
  it("degrades to [] where no 2D canvas context exists (jsdom/SSR)", () => {
    expect(sampleWordmark("PULSAR")).toEqual([]);
  });
});

describe("buildConstellation", () => {
  const points = [
    { x: -0.5, y: 0 },
    { x: 0, y: 0.1 },
    { x: 0.5, y: -0.1 },
  ];

  it("is deterministic for a given seed", () => {
    const a = buildConstellation(points, { seed: 42 });
    const b = buildConstellation(points, { seed: 42 });
    expect([...a.start]).toEqual([...b.start]);
    expect([...a.target]).toEqual([...b.target]);
    expect([...a.delay]).toEqual([...b.delay]);
  });

  it("allocates 3 floats per particle", () => {
    const c = buildConstellation(points);
    expect(c.count).toBe(points.length);
    expect(c.start).toHaveLength(points.length * 3);
    expect(c.target).toHaveLength(points.length * 3);
    expect(c.delay).toHaveLength(points.length);
  });

  it("starts every particle inside the shell", () => {
    const [rMin, rMax] = [7, 15] as const;
    const c = buildConstellation(points, { shell: [rMin, rMax], seed: 3 });
    for (let i = 0; i < c.count; i++) {
      const d = Math.hypot(c.start[i * 3], c.start[i * 3 + 1], c.start[i * 3 + 2]);
      expect(d).toBeGreaterThanOrEqual(rMin - 1e-6);
      expect(d).toBeLessThanOrEqual(rMax + 1e-6);
    }
  });

  it("sweeps delays left-to-right (Bass reveal)", () => {
    const c = buildConstellation(points, { seed: 9 });
    // leftmost target should fire no later than the rightmost (jitter ≤ 12%)
    expect(c.delay[0]).toBeLessThan(c.delay[2]);
  });

  it("scales targets from the normalised mask", () => {
    const c = buildConstellation(points, { scale: 4, seed: 1 });
    expect(c.target[0]).toBeCloseTo(-2, 6); // -0.5 * 4
    expect(c.target[3 * 2]).toBeCloseTo(2, 6); // 0.5 * 4
  });

  it("handles an empty mask without throwing", () => {
    const c = buildConstellation([], { seed: 1 });
    expect(c.count).toBe(0);
  });
});

describe("mulberry32", () => {
  it("is deterministic and in [0,1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
