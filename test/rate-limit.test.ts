import { describe, it, expect, beforeEach, vi } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows hits under the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k1", { limit: 5, windowMs: 60_000 }).ok).toBe(true);
    }
  });

  it("rejects the hit after the limit is reached", () => {
    const key = "k2";
    for (let i = 0; i < 3; i++) rateLimit(key, { limit: 3, windowMs: 60_000 });
    const blocked = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("recovers as hits age out of the sliding window", () => {
    const key = "k3";
    rateLimit(key, { limit: 2, windowMs: 60_000 });
    rateLimit(key, { limit: 2, windowMs: 60_000 });
    expect(rateLimit(key, { limit: 2, windowMs: 60_000 }).ok).toBe(false);

    // Advance 61s — both hits have slid out of the window.
    vi.advanceTimersByTime(61_000);
    expect(rateLimit(key, { limit: 2, windowMs: 60_000 }).ok).toBe(true);
  });

  it("keeps keys isolated", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", { limit: 3, windowMs: 60_000 });
    expect(rateLimit("b", { limit: 3, windowMs: 60_000 }).ok).toBe(true);
  });

  it("retryAfter reflects the oldest hit's remaining lifetime", () => {
    const key = "k4";
    rateLimit(key, { limit: 1, windowMs: 30_000 });
    vi.advanceTimersByTime(10_000);
    const blocked = rateLimit(key, { limit: 1, windowMs: 30_000 });
    expect(blocked.ok).toBe(false);
    // Oldest hit is 10s old in a 30s window → ~20s left.
    expect(blocked.retryAfter).toBe(20);
  });

  it("namespaces by route name", () => {
    rateLimit("ask:1.2.3.4", { limit: 1, windowMs: 60_000 });
    expect(rateLimit("chain:1.2.3.4", { limit: 1, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit("ask:1.2.3.4", { limit: 1, windowMs: 60_000 }).ok).toBe(false);
  });
});