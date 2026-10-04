import { describe, it, expect } from "vitest";
import type { TargetAndTransition, Variant } from "framer-motion";
import { EASE, DUR, SPRING, fadeUp, pop, staggerParent, sheet, ms } from "@/lib/motion";

/**
 * The motion system exists so components stop inventing their own springs and,
 * more importantly, so `prefers-reduced-motion` is honoured by construction
 * rather than by each author remembering to check it.
 *
 * These pin the second part. A helper that quietly animates anyway when the
 * visitor asked it not to is the exact failure this system is meant to make
 * impossible, and it is invisible in review.
 */

/**
 * Does a variant move the element, as opposed to merely fading it?
 *
 * Typed against framer's own `Variant` rather than a loose record: the
 * factories return framer types, and widening them here would have hidden the
 * mismatch that broke `tsc --noEmit` while tests and build both stayed green.
 */
function moves(v: Variant | undefined): boolean {
  const t = target(v);
  return !!t && ["x", "y", "scale", "rotate"].some((k) => k in t);
}

/**
 * A framer `Variant` is either a target object or a resolver function. Only the
 * object form carries readable values, so narrow once here rather than casting
 * at each assertion.
 */
function target(v: Variant | undefined): TargetAndTransition | undefined {
  return !v || typeof v === "function" ? undefined : (v as TargetAndTransition);
}

describe("reduced motion is honoured by every helper", () => {
  it("fadeUp does not translate", () => {
    const r = fadeUp(true);
    expect(moves(r.hidden)).toBe(false);
    expect(moves(r.show)).toBe(false);
    // It must still become visible — reduced motion is not "hide the content".
    expect(target(r.hidden)?.opacity).toBe(0);
    expect(target(r.show)?.opacity).toBe(1);
  });

  it("pop does not scale", () => {
    const r = pop(true);
    expect(moves(r.hidden)).toBe(false);
    expect(target(r.show)?.opacity).toBe(1);
  });

  it("staggerParent emits no per-child delay", () => {
    const r = staggerParent(true, 20);
    expect(r.show).toEqual({});
  });

  it("sheet neither slides nor scales, on either form factor", () => {
    for (const mobile of [true, false]) {
      const s = sheet(true, mobile);
      expect(moves(s.initial as Variant), `mobile=${mobile}`).toBe(false);
      expect(moves(s.animate as Variant), `mobile=${mobile}`).toBe(false);
    }
  });

  it("ms() collapses to zero so imperative animations are skippable", () => {
    expect(ms(0.6, true)).toBe(0);
    expect(ms(0.6, false)).toBe(600);
  });

  it("treats framer's pre-measurement null as 'motion allowed'", () => {
    // useReducedMotion returns null before it has measured. Treating null as
    // "reduce" would make the first paint of every list static and then jump.
    expect(moves(fadeUp(null).hidden)).toBe(true);
    expect(moves(fadeUp(undefined).hidden)).toBe(true);
  });
});

describe("motion is allowed to move when nobody objected", () => {
  it("fadeUp translates and settles at rest", () => {
    const r = fadeUp(false, 12);
    expect(target(r.hidden)?.y).toBe(12);
    expect(target(r.show)?.y).toBe(0);
  });

  it("sheet slides up from the bottom on mobile, and scales on desktop", () => {
    expect(sheet(false, true).initial).toMatchObject({ y: "100%" });
    expect(sheet(false, false).initial).toMatchObject({ scale: 0.97 });
  });
});

describe("stagger stays quick as lists grow", () => {
  const delayFor = (count: number) => {
    const t = target(staggerParent(false, count).show)?.transition as
      | { staggerChildren: number }
      | undefined;
    return t?.staggerChildren ?? 0;
  };

  it("caps total reveal time rather than the per-item delay", () => {
    // 40 items at a flat 45ms would take 1.8s to finish appearing, which reads
    // as the app being slow rather than as craft.
    expect(delayFor(40) * 40).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(delayFor(100) * 100).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it("uses the comfortable per-item delay for short lists", () => {
    expect(delayFor(4)).toBeCloseTo(0.045, 5);
  });

  it("never divides by zero on an empty list", () => {
    expect(delayFor(0)).toBe(0);
  });
});

describe("tokens", () => {
  it("exposes one spring, so panels agree with each other", () => {
    expect(SPRING).toMatchObject({ type: "spring", stiffness: 480, damping: 42 });
  });

  it("keeps interaction durations under the sluggish threshold", () => {
    for (const k of ["instant", "fast", "base", "slow"] as const) {
      expect(DUR[k], k).toBeLessThanOrEqual(0.5);
    }
  });

  it("easings are valid cubic-bezier control points", () => {
    for (const [name, e] of Object.entries(EASE)) {
      expect(e, name).toHaveLength(4);
      // x values must stay in [0,1] or the curve isn't a valid timing function.
      expect(e[0], name).toBeGreaterThanOrEqual(0);
      expect(e[0], name).toBeLessThanOrEqual(1);
      expect(e[2], name).toBeGreaterThanOrEqual(0);
      expect(e[2], name).toBeLessThanOrEqual(1);
    }
  });
});
