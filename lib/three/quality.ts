/**
 * Pulsar — Observatory quality gating
 *
 * Two decisions, both pure so they're testable without a GPU:
 *
 *  1. Does the visitor get the 3D scene at all? The capability probe's
 *     `enable3D` also says no to reduced motion, but the Observatory has a
 *     designed still form (snap, no drift, records already settled), so here
 *     reduced motion is served that instead of the 2D page.
 *  2. Does the scene get the postprocessing finish ("full") or skip the
 *     composer ("lite")? Decided once from device hints, then ratcheted down
 *     — never back up — by sustained slow frames from the perf harness.
 */

import type { Capabilities } from "@/lib/capabilities";
import type { PerfSample } from "@/lib/perf-harness";

export type FxTier = "full" | "lite";

export function shouldRender3D(caps: Capabilities): boolean {
  return caps.webgl2 && !caps.saveData && !caps.lowMemory;
}

/** `?fx=full|lite` pins the tier (QA and perf comparisons); anything else is ignored. */
export function parseFxOverride(search: string): FxTier | null {
  const v = new URLSearchParams(search).get("fx");
  return v === "full" || v === "lite" ? v : null;
}

export interface DeviceHints {
  hardwareConcurrency?: number;
  /** Chrome-only, rounded to a power of two; undefined elsewhere. */
  deviceMemory?: number;
}

export function initialFxTier(
  caps: Capabilities,
  hints: DeviceHints,
  override: FxTier | null = null,
): FxTier {
  if (override) return override;
  const cores = hints.hardwareConcurrency ?? 4;
  const mem = hints.deviceMemory;
  if (caps.coarsePointer) {
    // Half-float render targets + bloom mips are fill-rate a budget phone
    // doesn't have. WebKit reports 4 cores for most iPhones, so 4 must pass;
    // the governor catches the ones that then can't keep up.
    if (cores < 4) return "lite";
    if (mem !== undefined && mem < 4) return "lite";
    return "full";
  }
  return cores <= 2 ? "lite" : "full";
}

/**
 * The composer's MSAA and bloom mips scale with pixel count; past 1.5 the
 * extra density is invisible behind the grain and vignette anyway.
 */
export function dprCap(tier: FxTier, deviceDpr: number): number {
  const d = deviceDpr > 0 ? deviceDpr : 1;
  return Math.min(d, tier === "full" ? 1.5 : 1.25);
}

export interface GovernorOptions {
  /** No verdicts during the opening seconds: shader compiles land here. */
  warmupMs?: number;
  /** A smoothed frame time above this counts against the finish (~40fps). */
  slowMs?: number;
  /** How long the smoothed frame time must stay slow before the finish goes. */
  sustainMs?: number;
  /** EMA weight of the newest frame. */
  smoothing?: number;
  /** Frames are clamped to this first, so one tab-switch frame is a blip, not a verdict. */
  capMs?: number;
}

/**
 * Reads the perf harness's samples and says — once — when the composer has
 * to go. The harness's own `shouldDegrade` counts over-budget frames forever,
 * so on a 60Hz screen ordinary jitter would trip it eventually; this asks for
 * the smoothed frame time to stay over budget for a stretch of wall time.
 * Time, not frame count: a device managing 3fps must not need 30 seconds of
 * slideshow to be believed. A single long frame (a compile, the wasm landing,
 * a tab switch) decays out of the average long before `sustainMs`.
 */
export class FxGovernor {
  private readonly warmupMs: number;
  private readonly slowMs: number;
  private readonly sustainMs: number;
  private readonly smoothing: number;
  private readonly capMs: number;
  private ema: number | null = null;
  private slowSince: number | null = null;
  private startedAt: number | null = null;
  private tripped = false;

  constructor({
    warmupMs = 3500,
    slowMs = 1000 / 40,
    sustainMs = 2000,
    smoothing = 0.1,
    capMs = 1000,
  }: GovernorOptions = {}) {
    this.warmupMs = warmupMs;
    this.slowMs = slowMs;
    this.sustainMs = sustainMs;
    this.smoothing = smoothing;
    this.capMs = capMs;
  }

  get degraded(): boolean {
    return this.tripped;
  }

  /** Feed one harness sample; returns true exactly once, when the finish should drop. */
  push(sample: PerfSample, nowMs: number): boolean {
    if (this.tripped) return false;
    if (this.startedAt === null) this.startedAt = nowMs;
    const ms = Math.min(sample.frameMs, this.capMs);
    this.ema = this.ema === null ? ms : this.ema + (ms - this.ema) * this.smoothing;
    if (nowMs - this.startedAt < this.warmupMs) return false;
    if (this.ema <= this.slowMs) {
      this.slowSince = null;
      return false;
    }
    if (this.slowSince === null) this.slowSince = nowMs;
    if (nowMs - this.slowSince < this.sustainMs) return false;
    this.tripped = true;
    return true;
  }
}
