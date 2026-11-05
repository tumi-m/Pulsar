import { describe, it, expect, vi, afterEach } from "vitest";
import { cachedImport, ifReadyWithin, loadAnime } from "@/lib/animeLoader";

/**
 * Anime.js is kept out of the home page bundle by loading it on demand. That
 * only stays cheap if the chunk is fetched once — every graph that mounts, and
 * every expand, goes through this loader.
 */
describe("cachedImport", () => {
  it("shares one import between concurrent and later callers", async () => {
    const importer = vi.fn(async () => ({ ok: true }));
    const load = cachedImport(importer);
    const a = load();
    const b = load();
    expect(a).toBe(b);
    await a;
    expect(load()).toBe(a);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed import so the next call retries", async () => {
    const importer = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("ChunkLoadError"))
      .mockResolvedValueOnce("loaded");
    const load = cachedImport(importer);
    await expect(load()).rejects.toThrow("ChunkLoadError");
    await expect(load()).resolves.toBe("loaded");
    expect(importer).toHaveBeenCalledTimes(2);
    // …and the success, once it lands, is what sticks.
    await load();
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

/**
 * The graph has its data before it has the animation library at all on a slow
 * connection. It must show the data, not wait out webpack's two-minute chunk
 * timeout behind a spinner.
 */
describe("ifReadyWithin", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hands back a library that's already loaded without waiting", async () => {
    vi.useFakeTimers();
    const kit = { ok: true };
    const got = ifReadyWithin(Promise.resolve(kit), 150);
    // Resolves on microtasks alone: no timer has to fire.
    await expect(got).resolves.toBe(kit);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a library that lands inside the grace", async () => {
    vi.useFakeTimers();
    let land!: (v: string) => void;
    const got = ifReadyWithin(new Promise<string>((r) => (land = r)), 150);
    await vi.advanceTimersByTimeAsync(100);
    land("kit");
    await expect(got).resolves.toBe("kit");
  });

  it("gives up after the grace on a stalled chunk, and ignores it when it lands", async () => {
    vi.useFakeTimers();
    let land!: (v: string) => void;
    const slow = new Promise<string>((r) => (land = r));
    const got = ifReadyWithin(slow, 150);
    await vi.advanceTimersByTimeAsync(150);
    await expect(got).resolves.toBeNull();
    // The chunk keeps loading for whoever asks next.
    land("kit");
    await expect(slow).resolves.toBe("kit");
  });

  it("turns a failed chunk into null rather than a rejection", async () => {
    vi.useFakeTimers();
    const got = ifReadyWithin(Promise.reject(new Error("ChunkLoadError")), 150);
    await expect(got).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("loadAnime", () => {
  it("resolves the slice of Anime.js the graph uses, once", async () => {
    const first = loadAnime();
    expect(loadAnime()).toBe(first);
    const kit = await first;
    expect(typeof kit.createTimeline).toBe("function");
    expect(typeof kit.createDrawable).toBe("function");
    expect(typeof kit.cubicBezier).toBe("function");
    expect(await loadAnime()).toBe(kit);
  });
});
