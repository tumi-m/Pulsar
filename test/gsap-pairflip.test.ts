import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * usePairFlip's lifecycle — the part of the flip choreography that decides
 * WHETHER GSAP runs at all: only once a row is seen, never for reduced motion,
 * not when it arrives too late to look intentional, and always reverted on
 * unmount, on a data change and on completion.
 */

const h = vi.hoisted(() => {
  const state = {
    built: [] as Element[],
    onComplete: null as null | (() => void),
    timeline: true,
    ctxs: [] as { revert: ReturnType<typeof vi.fn>; scope: unknown }[],
    matchMedia: vi.fn(),
  };
  const loadGsap = vi.fn(async () => ({
    gsap: {
      // Must stay unused: every gsap.matchMedia() leaves GSAP's own listeners
      // on two MediaQueryLists for good.
      matchMedia: state.matchMedia,
      context: (fn: () => void, scope: unknown) => {
        const ctx = { revert: vi.fn(), scope };
        state.ctxs.push(ctx);
        fn();
        return ctx;
      },
    },
    plugins: {},
  }));
  return { state, loadGsap };
});

vi.mock("@/lib/gsapLoader", () => ({ loadGsap: h.loadGsap }));
vi.mock("@/components/samples/flipTimeline", () => ({
  buildFlipTimeline: (_gsap: unknown, root: Element) => {
    if (!h.state.timeline) return null;
    h.state.built.push(root);
    return {
      eventCallback: (_name: string, cb: () => void) => {
        h.state.onComplete = cb;
      },
    };
  },
}));

import { usePairFlip } from "@/components/samples/usePairFlip";

let observers: { cb: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn>; opts?: IntersectionObserverInit }[];
let reducedQuery = false;
/** Live "change" listeners on the reduced-motion query, across every MQL. */
let mqListeners: Set<() => void>;

beforeEach(() => {
  observers = [];
  reducedQuery = false;
  mqListeners = new Set();
  h.state.built = [];
  h.state.onComplete = null;
  h.state.timeline = true;
  h.state.ctxs = [];
  h.state.matchMedia.mockClear();
  h.loadGsap.mockClear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      disconnect = vi.fn();
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
        observers.push({ cb, disconnect: this.disconnect, opts });
      }
      observe() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
  );
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) =>
      ({
        get matches() {
          return q.includes("reduce") && reducedQuery;
        },
        media: q,
        addEventListener: (_type: string, fn: () => void) => mqListeners.add(fn),
        removeEventListener: (_type: string, fn: () => void) => mqListeners.delete(fn),
      }) as unknown as MediaQueryList
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const preferReduce = () => {
  reducedQuery = true;
  for (const fn of [...mqListeners]) fn();
};
const seen = (i = observers.length - 1) =>
  observers[i].cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

function mount(key = "a") {
  const root = document.createElement("div");
  const ref = { current: root };
  const hook = renderHook(({ k }) => usePairFlip(ref, k), { initialProps: { k: key } });
  return { root, ...hook };
}

describe("usePairFlip", () => {
  it("doesn't fetch GSAP until the row is actually on screen", async () => {
    mount();
    await flush();
    expect(h.loadGsap).not.toHaveBeenCalled();
    expect(observers[0].opts?.threshold).toBe(0.5);
  });

  it("plays once when seen, inside a context scoped to the row", async () => {
    const { root } = mount();
    seen();
    await flush();
    expect(h.loadGsap).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalled(); // once, not on every scroll past
    expect(h.state.built).toEqual([root]);
    expect(h.state.ctxs).toHaveLength(1);
    expect(h.state.ctxs[0].scope).toBe(root);
    expect(h.state.matchMedia).not.toHaveBeenCalled();
  });

  it("never downloads GSAP for someone who prefers reduced motion", async () => {
    reducedQuery = true;
    mount();
    await flush();
    expect(observers).toHaveLength(0);
    expect(h.loadGsap).not.toHaveBeenCalled();
  });

  it("builds nothing if the preference flips to reduce before the timeline starts", async () => {
    mount();
    seen();
    reducedQuery = true; // while GSAP was downloading
    await flush();
    expect(h.state.ctxs).toHaveLength(0);
    expect(h.state.built).toHaveLength(0);
    expect(mqListeners.size).toBe(0);
  });

  it("jumps to the final state if the preference flips to reduce mid-flight", async () => {
    mount();
    seen();
    await flush();
    expect(mqListeners.size).toBe(1);
    preferReduce();
    expect(h.state.ctxs[0].revert).toHaveBeenCalledTimes(1);
    expect(mqListeners.size).toBe(0);
  });

  it("skips the replay when GSAP arrives long after the row was seen", async () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    mount();
    seen();
    now.mockReturnValue(1000 + 2000); // GSAP resolved two seconds later
    await flush();
    expect(h.state.built).toHaveLength(0);
  });

  it("hands the row back to React on completion (reverts every inline style) and stops listening", async () => {
    mount();
    seen();
    await flush();
    expect(h.state.ctxs[0].revert).not.toHaveBeenCalled();
    h.state.onComplete!();
    expect(h.state.ctxs[0].revert).toHaveBeenCalledTimes(1);
    expect(mqListeners.size).toBe(0);
  });

  it("leaves no media-query listener behind however many rows play", async () => {
    const rows = [mount("a"), mount("b"), mount("c")];
    for (let i = 0; i < rows.length; i++) {
      seen(i);
      await flush();
    }
    expect(mqListeners.size).toBe(3);
    h.state.onComplete!(); // the last row finishes; the others are left mid-flight
    expect(mqListeners.size).toBe(2);
    rows.forEach((r) => r.unmount());
    expect(mqListeners.size).toBe(0);
    expect(h.state.ctxs.every((c) => c.revert.mock.calls.length === 1)).toBe(true);
  });

  it("doesn't listen at all when there is nothing to animate", async () => {
    h.state.timeline = false;
    mount();
    seen();
    await flush();
    expect(mqListeners.size).toBe(0);
  });

  it("reverts on unmount and stops listening", async () => {
    const { unmount } = mount();
    seen();
    await flush();
    unmount();
    expect(h.state.ctxs[0].revert).toHaveBeenCalled();
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(mqListeners.size).toBe(0);
  });

  it("does nothing after unmount even if GSAP resolves later", async () => {
    const { unmount } = mount();
    seen();
    unmount();
    await flush();
    expect(h.state.built).toHaveLength(0);
    expect(mqListeners.size).toBe(0);
  });

  it("reverts the old timeline and replays when the row's data changes", async () => {
    const { rerender } = mount("a");
    seen(0);
    await flush();
    rerender({ k: "b" }); // e.g. a timing mark was saved
    expect(h.state.ctxs[0].revert).toHaveBeenCalled();
    expect(observers).toHaveLength(2);
    seen(1);
    await flush();
    expect(h.state.built).toHaveLength(2);
    expect(mqListeners.size).toBe(1);
  });
});
