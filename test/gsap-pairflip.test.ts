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
    reduce: false,
    built: [] as Element[],
    onComplete: null as null | (() => void),
    mms: [] as { add: ReturnType<typeof vi.fn>; revert: ReturnType<typeof vi.fn>; queries?: object }[],
  };
  const loadGsap = vi.fn(async () => ({
    gsap: {
      matchMedia: () => {
        const mm = {
          queries: undefined as object | undefined,
          add: vi.fn((queries: object, fn: (ctx: { conditions: { reduce: boolean } }) => void) => {
            mm.queries = queries;
            fn({ conditions: { reduce: state.reduce } });
          }),
          revert: vi.fn(),
        };
        state.mms.push(mm);
        return mm;
      },
    },
    plugins: {},
  }));
  return { state, loadGsap };
});

vi.mock("@/lib/gsapLoader", () => ({ loadGsap: h.loadGsap }));
vi.mock("@/components/samples/flipTimeline", () => ({
  buildFlipTimeline: (_gsap: unknown, root: Element) => {
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

beforeEach(() => {
  observers = [];
  reducedQuery = false;
  h.state.reduce = false;
  h.state.built = [];
  h.state.onComplete = null;
  h.state.mms = [];
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
    (q: string) => ({ matches: q.includes("reduce") && reducedQuery, media: q }) as MediaQueryList
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

  it("plays once when seen, inside a reduced-motion-aware matchMedia scoped to the row", async () => {
    const { root } = mount();
    seen();
    await flush();
    expect(h.loadGsap).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalled(); // once, not on every scroll past
    expect(h.state.built).toEqual([root]);
    expect(h.state.mms[0].queries).toMatchObject({ reduce: "(prefers-reduced-motion: reduce)" });
  });

  it("never downloads GSAP for someone who prefers reduced motion", async () => {
    reducedQuery = true;
    mount();
    await flush();
    expect(observers).toHaveLength(0);
    expect(h.loadGsap).not.toHaveBeenCalled();
  });

  it("builds nothing if the preference flips to reduce before the timeline starts", async () => {
    h.state.reduce = true;
    mount();
    seen();
    await flush();
    expect(h.state.mms).toHaveLength(1);
    expect(h.state.built).toHaveLength(0);
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

  it("hands the row back to React on completion (reverts every inline style)", async () => {
    mount();
    seen();
    await flush();
    expect(h.state.mms[0].revert).not.toHaveBeenCalled();
    h.state.onComplete!();
    expect(h.state.mms[0].revert).toHaveBeenCalledTimes(1);
  });

  it("reverts on unmount and stops listening", async () => {
    const { unmount } = mount();
    seen();
    await flush();
    unmount();
    expect(h.state.mms[0].revert).toHaveBeenCalled();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("does nothing after unmount even if GSAP resolves later", async () => {
    const { unmount } = mount();
    seen();
    unmount();
    await flush();
    expect(h.state.built).toHaveLength(0);
  });

  it("reverts the old timeline and replays when the row's data changes", async () => {
    const { rerender } = mount("a");
    seen(0);
    await flush();
    rerender({ k: "b" }); // e.g. a timing mark was saved
    expect(h.state.mms[0].revert).toHaveBeenCalled();
    expect(observers).toHaveLength(2);
    seen(1);
    await flush();
    expect(h.state.built).toHaveLength(2);
  });
});
