/**
 * Pulsar — Device Capability Probe (P0)
 *
 * Decides whether a visitor gets the immersive 3D experience or the
 * accessible 2D baseline. The 2D path must never regress, so we only
 * enable 3D when we're confident it will run well and be welcome.
 */

export interface Capabilities {
  webgl2: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  lowMemory: boolean;
  coarsePointer: boolean;
  /** Final verdict: render the 3D experience? */
  enable3D: boolean;
}

function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

export function probeCapabilities(): Capabilities {
  if (typeof window === "undefined") {
    return {
      webgl2: false,
      reducedMotion: false,
      saveData: false,
      lowMemory: false,
      coarsePointer: false,
      enable3D: false,
    };
  }

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  const saveData = nav.connection?.saveData ?? false;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 3;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const webgl2 = hasWebGL2();

  // Enable 3D only with WebGL2, motion allowed, no data-saver, enough memory.
  const enable3D = webgl2 && !reducedMotion && !saveData && !lowMemory;

  return { webgl2, reducedMotion, saveData, lowMemory, coarsePointer, enable3D };
}
