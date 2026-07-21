/**
 * Pulsar — Performance Harness (P0)
 *
 * A tiny frame-budget instrument. Every 3D set-piece runs against this so
 * "60fps on the reference device" is a measured gate, not a vibe. Tracks
 * a rolling FPS estimate and reports when frames breach budget, so later
 * phases can wire adaptive-quality decisions to real numbers.
 */

export interface PerfSample {
  fps: number;
  frameMs: number;
  overBudget: boolean;
}

const BUDGET_MS = 1000 / 55; // 55fps floor before we call it "over budget"

export class PerfHarness {
  private last = 0;
  private frames = 0;
  private acc = 0;
  private fps = 60;
  private overCount = 0;
  private readonly onReport?: (s: PerfSample) => void;

  constructor(onReport?: (s: PerfSample) => void) {
    this.onReport = onReport;
  }

  /** Call once per animation frame with the RAF timestamp. */
  tick(now: number): PerfSample {
    const frameMs = this.last ? now - this.last : 16.7;
    this.last = now;
    this.frames++;
    this.acc += frameMs;
    if (this.acc >= 500) {
      this.fps = Math.round((this.frames * 1000) / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
    const overBudget = frameMs > BUDGET_MS;
    if (overBudget) this.overCount++;
    const sample: PerfSample = { fps: this.fps, frameMs, overBudget };
    this.onReport?.(sample);
    return sample;
  }

  /** Sustained overage suggests we should drop quality. */
  get shouldDegrade(): boolean {
    return this.overCount > 30;
  }

  reset() {
    this.overCount = 0;
  }
}
