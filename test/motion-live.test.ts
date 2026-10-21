import { act, renderHook } from "@testing-library/react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "@/lib/motion";

/**
 * lib/motion's useReducedMotion follows the setting while mounted. Motion's own
 * hook reads it once at mount, so the dock, the Visualizer and the Rive deck
 * (mounted for the whole visit) kept moving after Reduce Motion was turned on
 * until a reload.
 */

const original = window.matchMedia;
afterAll(() => {
  window.matchMedia = original;
});

const listeners = new Set<() => void>();
const state = { matches: false };
const mq = {
  get matches() {
    return state.matches;
  },
  media: "(prefers-reduced-motion: reduce)",
  addListener: (cb: () => void) => listeners.add(cb),
  removeListener: (cb: () => void) => listeners.delete(cb),
  addEventListener: (_: string, cb: () => void) => listeners.add(cb),
  removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
};
// Installed before the first render, so Motion's own one-time reading uses it too.
window.matchMedia = vi.fn(() => mq) as unknown as typeof window.matchMedia;
const set = (v: boolean) => {
  state.matches = v;
  listeners.forEach((cb) => cb());
};

describe("useReducedMotion (lib/motion)", () => {
  it("follows Reduce Motion switched on and off mid-visit, and stops listening on unmount", () => {
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    const subscribed = listeners.size;

    act(() => set(true));
    expect(result.current).toBe(true);
    act(() => set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(listeners.size).toBe(subscribed - 1);
  });

  it("starts from the current setting for something mounted after a switch", () => {
    act(() => set(true));
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
    act(() => set(false));
    expect(result.current).toBe(false);
  });
});
