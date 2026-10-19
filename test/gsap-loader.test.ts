import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * lib/gsapLoader is the only door GSAP comes through (a static import would
 * land it in the home page's first load). These pin its contract: one fetch,
 * one registration, and a failed load that doesn't stick for the session.
 */

const { registerPlugin, imported } = vi.hoisted(() => ({
  registerPlugin: vi.fn(),
  imported: { core: 0 },
}));

// Vitest caches a mock factory's result across resetModules(), so count reads
// of the export the loader actually uses rather than factory runs.
vi.mock("gsap", () => {
  const gsap = { registerPlugin, version: "test" };
  return {
    get gsap() {
      imported.core++;
      return gsap;
    },
    default: gsap,
  };
});
vi.mock("gsap/DrawSVGPlugin", () => ({ DrawSVGPlugin: { name: "drawSVG" } }));
vi.mock("gsap/MotionPathPlugin", () => ({ MotionPathPlugin: { name: "motionPath" } }));
vi.mock("gsap/ScrambleTextPlugin", () => ({ ScrambleTextPlugin: { name: "scrambleText" } }));

async function freshLoader() {
  vi.resetModules();
  return import("@/lib/gsapLoader");
}

beforeEach(() => {
  registerPlugin.mockReset();
  imported.core = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadGsap", () => {
  it("hands back gsap and the three plugins it uses", async () => {
    const { loadGsap } = await freshLoader();
    const kit = await loadGsap();
    expect(kit.gsap).toMatchObject({ version: "test" });
    expect(Object.keys(kit.plugins).sort()).toEqual([
      "DrawSVGPlugin",
      "MotionPathPlugin",
      "ScrambleTextPlugin",
    ]);
  });

  it("caches the promise: a page of rows asking at once shares one load", async () => {
    const { loadGsap } = await freshLoader();
    const calls = Array.from({ length: 8 }, () => loadGsap());
    expect(new Set(calls).size).toBe(1);
    await Promise.all(calls);
    // ...and asking again after it has settled still returns the same one.
    expect(loadGsap()).toBe(calls[0]);
    expect(imported.core).toBe(1);
  });

  it("registers every plugin exactly once, in a single call", async () => {
    const { loadGsap } = await freshLoader();
    await Promise.all([loadGsap(), loadGsap(), loadGsap()]);
    await loadGsap();
    expect(registerPlugin).toHaveBeenCalledTimes(1);
    const names = registerPlugin.mock.calls[0].map((p: { name: string }) => p.name);
    expect(names).toEqual(["drawSVG", "motionPath", "scrambleText"]);
  });

  it("does not cache a failure — the next caller retries", async () => {
    const { loadGsap } = await freshLoader();
    registerPlugin.mockImplementationOnce(() => {
      throw new Error("chunk went missing");
    });
    const first = loadGsap();
    await expect(first).rejects.toThrow("chunk went missing");
    // The reset runs in a .catch on the cached promise; let it settle.
    await Promise.resolve();

    const second = loadGsap();
    expect(second).not.toBe(first);
    await expect(second).resolves.toMatchObject({ gsap: { version: "test" } });
    expect(registerPlugin).toHaveBeenCalledTimes(2);
  });

  it("refuses to run on the server, without importing anything", async () => {
    const { loadGsap } = await freshLoader();
    vi.stubGlobal("window", undefined);
    await expect(loadGsap()).rejects.toThrow(/browser-only/);
    expect(imported.core).toBe(0);
    expect(registerPlugin).not.toHaveBeenCalled();
  });
});
