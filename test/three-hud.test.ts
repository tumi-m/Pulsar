import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { READOUT_LINGER_MS, useHeldReadout } from "@/components/three/useHeldReadout";
import { usePrefersReducedMotion } from "@/components/three/usePrefersReducedMotion";

describe("useHeldReadout", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the held label, lingers it after release, then clears", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHeldReadout());
    expect(result.current[0]).toBeNull();

    act(() => result.current[1]("Seed Artist 9 — Seed Title 9"));
    expect(result.current[0]).toBe("Seed Artist 9 — Seed Title 9");

    // let go: still readable for a moment (a tap is held for ~100 ms)…
    act(() => result.current[1](null));
    act(() => vi.advanceTimersByTime(READOUT_LINGER_MS - 1));
    expect(result.current[0]).toBe("Seed Artist 9 — Seed Title 9");
    // …then gone, so the page's hint returns
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBeNull();
  });

  it("a new pick during the linger replaces the label and isn't cleared by the old timer", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHeldReadout(1000));
    act(() => result.current[1]("A"));
    act(() => result.current[1](null));
    act(() => vi.advanceTimersByTime(600));
    act(() => result.current[1]("B"));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current[0]).toBe("B"); // still held
    act(() => result.current[1](null));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current[0]).toBeNull();
  });

  it("keeps one callback identity (the canvas is memoised on it)", () => {
    const { result, rerender } = renderHook(() => useHeldReadout());
    const first = result.current[1];
    act(() => first("A"));
    rerender();
    expect(result.current[1]).toBe(first);
  });

  it("drops a pending linger on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useHeldReadout());
    act(() => result.current[1]("A"));
    act(() => result.current[1](null));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("usePrefersReducedMotion", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  /** A controllable media query, in the modern or the Safari < 14 listener API. */
  function fakeQuery(legacy = false) {
    const listeners = new Set<() => void>();
    const state = { matches: false };
    const mq = {
      get matches() {
        return state.matches;
      },
      media: "(prefers-reduced-motion: reduce)",
      addListener: (cb: () => void) => listeners.add(cb),
      removeListener: (cb: () => void) => listeners.delete(cb),
      ...(legacy
        ? {}
        : {
            addEventListener: (_: string, cb: () => void) => listeners.add(cb),
            removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
          }),
    };
    window.matchMedia = vi.fn(() => mq) as unknown as typeof window.matchMedia;
    return {
      listeners,
      set(v: boolean) {
        state.matches = v;
        listeners.forEach((cb) => cb());
      },
    };
  }

  it.each([false, true])("follows the OS setting while mounted (legacy API: %s)", (legacy) => {
    const q = fakeQuery(legacy);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => q.set(true)); // Reduce Motion switched on mid-visit
    expect(result.current).toBe(true);
    act(() => q.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(q.listeners.size).toBe(0);
  });

  it("reads the setting on the first render", () => {
    const q = fakeQuery();
    q.set(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });
});
