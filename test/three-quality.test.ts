import { describe, it, expect } from "vitest";
import type { Capabilities } from "@/lib/capabilities";
import {
  FxGovernor,
  dprCap,
  initialFxTier,
  parseFxOverride,
  shouldRender3D,
} from "@/lib/three/quality";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  webgl2: true,
  reducedMotion: false,
  saveData: false,
  lowMemory: false,
  coarsePointer: false,
  enable3D: true,
  ...over,
});

describe("shouldRender3D", () => {
  it("serves reduced motion the still scene, not the 2D page", () => {
    // the probe says no (enable3D false) — the Observatory has a still form
    expect(shouldRender3D(caps({ reducedMotion: true, enable3D: false }))).toBe(true);
  });

  it("still declines without WebGL2, on data-saver and on low memory", () => {
    expect(shouldRender3D(caps({ webgl2: false }))).toBe(false);
    expect(shouldRender3D(caps({ saveData: true }))).toBe(false);
    expect(shouldRender3D(caps({ lowMemory: true }))).toBe(false);
  });
});

describe("parseFxOverride", () => {
  it("pins only the two known tiers", () => {
    expect(parseFxOverride("?fx=full")).toBe("full");
    expect(parseFxOverride("?a=1&fx=lite")).toBe("lite");
    expect(parseFxOverride("?fx=ultra")).toBeNull();
    expect(parseFxOverride("")).toBeNull();
  });
});

describe("initialFxTier", () => {
  it("gives desktops the finish unless they are tiny", () => {
    expect(initialFxTier(caps(), { hardwareConcurrency: 8 })).toBe("full");
    expect(initialFxTier(caps(), { hardwareConcurrency: 2 })).toBe("lite");
  });

  it("lets a 4-core phone through (WebKit reports 4) but not a weaker one", () => {
    const phone = caps({ coarsePointer: true });
    expect(initialFxTier(phone, { hardwareConcurrency: 4 })).toBe("full");
    expect(initialFxTier(phone, { hardwareConcurrency: 2 })).toBe("lite");
    expect(initialFxTier(phone, { hardwareConcurrency: 8, deviceMemory: 2 })).toBe("lite");
    expect(initialFxTier(phone, { hardwareConcurrency: 8, deviceMemory: 4 })).toBe("full");
  });

  it("an override wins over every hint", () => {
    expect(initialFxTier(caps(), { hardwareConcurrency: 1 }, "full")).toBe("full");
    expect(initialFxTier(caps(), { hardwareConcurrency: 16 }, "lite")).toBe("lite");
  });
});

describe("dprCap", () => {
  it("caps a 3x phone and leaves a 1x screen alone", () => {
    expect(dprCap("full", 3)).toBe(1.5);
    expect(dprCap("lite", 3)).toBe(1.25);
    expect(dprCap("full", 1)).toBe(1);
    expect(dprCap("full", 0)).toBe(1);
  });
});

describe("FxGovernor", () => {
  const sample = (frameMs: number) => ({ fps: Math.round(1000 / frameMs), frameMs, overBudget: frameMs > 18 });

  /** Run frames of `frameMs` (or a per-frame function) for `durationMs` of clock time. */
  function run(g: FxGovernor, frameMs: number | ((i: number) => number), durationMs: number, t0 = 0) {
    let t = t0;
    let i = 0;
    let trippedAt: number | null = null;
    while (t < t0 + durationMs) {
      const ms = typeof frameMs === "number" ? frameMs : frameMs(i++);
      t += ms;
      if (g.push(sample(ms), t) && trippedAt === null) trippedAt = t;
    }
    return { trippedAt, end: t };
  }

  it("never judges during warm-up", () => {
    const g = new FxGovernor({ warmupMs: 3000 });
    expect(run(g, 80, 2900).trippedAt).toBeNull();
    expect(g.degraded).toBe(false);
  });

  it("drops the finish after the frame time stays slow for the sustain period", () => {
    const g = new FxGovernor({ warmupMs: 0, sustainMs: 2000 });
    const { trippedAt } = run(g, 50, 5000); // a steady 20fps
    expect(trippedAt).not.toBeNull();
    expect(trippedAt!).toBeGreaterThanOrEqual(2000);
    expect(trippedAt!).toBeLessThan(2600);
  });

  it("believes a 3fps device in seconds, not a 90-frame window", () => {
    const g = new FxGovernor({ warmupMs: 0, sustainMs: 2000 });
    const { trippedAt } = run(g, 333, 10000);
    expect(trippedAt).not.toBeNull();
    expect(trippedAt!).toBeLessThan(3000);
  });

  it("fires once, then stays quiet", () => {
    const g = new FxGovernor({ warmupMs: 0 });
    run(g, 50, 5000);
    expect(g.degraded).toBe(true);
    expect(run(g, 50, 5000, 5000).trippedAt).toBeNull();
  });

  it("ignores a healthy 60fps with occasional hitches", () => {
    const g = new FxGovernor({ warmupMs: 0 });
    expect(run(g, (i) => (i % 40 === 0 ? 45 : 16.7), 20000).trippedAt).toBeNull();
  });

  it("shrugs off one huge frame (a compile, the wasm landing, a tab switch)", () => {
    const g = new FxGovernor({ warmupMs: 0 });
    expect(run(g, (i) => (i === 100 ? 5000 : 16.7), 10000).trippedAt).toBeNull();
  });

  it("forgives a slow patch shorter than the sustain period", () => {
    const g = new FxGovernor({ warmupMs: 0, sustainMs: 2000 });
    run(g, 16.7, 1000);
    run(g, 60, 1200, 1000); // 1.2s rough patch
    expect(run(g, 16.7, 5000, 2200).trippedAt).toBeNull();
  });
});
