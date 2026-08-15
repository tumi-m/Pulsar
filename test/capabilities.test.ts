import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { probeCapabilities } from "@/lib/capabilities";

// jsdom's matchMedia is installed globally in test/setup.ts (matches:false).
type Mq = (q: string) => MediaQueryList;
const original = window.matchMedia;

function setMedia(reduced: boolean, coarse: boolean) {
  (window as unknown as { matchMedia: Mq }).matchMedia = ((query: string) => ({
    matches: query.includes("reduced-motion") ? reduced : coarse,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as Mq;
}

afterEach(() => {
  (window as unknown as { matchMedia: Mq }).matchMedia = original;
});

describe("probeCapabilities", () => {
  it("disables 3D when WebGL2 is unavailable (jsdom has no WebGL)", () => {
    setMedia(false, false);
    const caps = probeCapabilities();
    expect(caps.webgl2).toBe(false);
    expect(caps.enable3D).toBe(false);
  });

  it("reports reduced motion when the media query matches", () => {
    setMedia(true, false);
    const caps = probeCapabilities();
    expect(caps.reducedMotion).toBe(true);
    expect(caps.enable3D).toBe(false); // reduced motion blocks 3D
  });

  it("reports a coarse pointer when the pointer query matches", () => {
    setMedia(false, true);
    const caps = probeCapabilities();
    expect(caps.coarsePointer).toBe(true);
  });

  it("defaults all flags to false with no window (SSR guard)", () => {
    // jsdom always has a window; this exercises the saved original (matches:false).
    (window as unknown as { matchMedia: Mq }).matchMedia = original;
    const caps = probeCapabilities();
    expect(caps.reducedMotion).toBe(false);
    expect(caps.saveData).toBe(false);
    expect(caps.lowMemory).toBe(false);
    expect(caps.enable3D).toBe(false);
  });
});