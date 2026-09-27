"use client";

import type { Variants } from "framer-motion";
import { useReducedMotion } from "framer-motion";

/**
 * Re-exported so there is ONE reduced-motion hook in the codebase. Several
 * components already import framer's; adding a second implementation would
 * guarantee the two drift.
 *
 * Note it returns `boolean | null` — null before the first client frame — so
 * every helper below takes `Reduced` rather than `boolean`.
 */
export { useReducedMotion };

/** framer's hook is null until it has measured; treat that as "allow motion". */
export type Reduced = boolean | null | undefined;

/**
 * Pulsar — motion system.
 *
 * Every component was inventing its own springs and durations, so nothing felt
 * like it came from the same product: one sheet used `stiffness: 480`, another
 * `520`, a third a 0.4s tween. These are the canonical values. Use them.
 *
 * The other half of the job is honesty about motion preference. A page that
 * ignores `prefers-reduced-motion` is not merely unfashionable — for someone
 * with vestibular sensitivity it is actively unpleasant. Everything exported
 * here collapses to an instant, non-moving state when the visitor has asked
 * for that, so a component gets it right by using the system rather than by
 * remembering to check.
 */

/* ── easings ─────────────────────────────────────────────────────
   Named for what they're for, not for their curve. */
export const EASE = {
  /** Default for anything entering the screen. Decisive, settles quickly. */
  out: [0.22, 1, 0.36, 1] as const,
  /** Leaving. Slightly faster than entering — exits shouldn't be admired. */
  in: [0.4, 0, 1, 1] as const,
  /** Moving between two on-screen states. */
  inOut: [0.65, 0, 0.35, 1] as const,
  /** A little overshoot, for something that should feel physical. */
  overshoot: [0.34, 1.56, 0.64, 1] as const,
} as const;

/* ── durations (seconds) ─────────────────────────────────────────
   Anything above `slow` reads as sluggish on a phone. */
export const DUR = {
  instant: 0.12,
  fast: 0.18,
  base: 0.28,
  slow: 0.44,
  /** Ambient/background loops only — never blocks an interaction. */
  ambient: 8,
} as const;

/** The one spring. Used by every sheet, panel and popover. */
export const SPRING = { type: "spring", stiffness: 480, damping: 42 } as const;
/** Softer spring for things that should feel weighty (large panels). */
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 30 } as const;

/* ── variants ────────────────────────────────────────────────────
   Each factory takes `reduced` and returns variants that simply don't move
   when motion is unwelcome — the element still appears, it just arrives
   rather than travels. */

/** Rise and fade. The default entrance for content. */
export function fadeUp(reduced: Reduced, distance = 12): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: DUR.instant } },
      exit: { opacity: 0, transition: { duration: DUR.instant } },
    };
  }
  return {
    hidden: { opacity: 0, y: distance },
    show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
    exit: { opacity: 0, y: distance * 0.5, transition: { duration: DUR.fast, ease: EASE.in } },
  };
}

/** Scale in from slightly small. For badges, chips, confirmations. */
export function pop(reduced: Reduced): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: DUR.instant } },
    };
  }
  return {
    hidden: { opacity: 0, scale: 0.85 },
    show: { opacity: 1, scale: 1, transition: { duration: DUR.base, ease: EASE.overshoot } },
  };
}

/**
 * Container that reveals its children one after another.
 *
 * `cap` matters: a 40-item list staggered at 40ms would take 1.6s to finish
 * appearing, which reads as the app being slow rather than as craft. The delay
 * per child shrinks as the list grows so the whole reveal stays under ~400ms.
 */
export function staggerParent(reduced: Reduced, count: number, cap = 0.4): Variants {
  if (reduced) {
    return { hidden: {}, show: {} };
  }
  const per = count > 0 ? Math.min(0.045, cap / count) : 0;
  return {
    hidden: {},
    show: { transition: { staggerChildren: per, delayChildren: 0.02 } },
  };
}

/** Bottom sheet on mobile, centred dialog above it. */
export function sheet(reduced: Reduced, isMobile: boolean) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: DUR.instant },
    };
  }
  return isMobile
    ? {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
        transition: SPRING,
      }
    : {
        initial: { opacity: 0, y: 16, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.97 },
        transition: SPRING,
      };
}

/**
 * Duration in ms for imperative (Web Animations API) work, which doesn't take
 * framer's seconds. Returns 0 when motion is unwelcome so callers can skip.
 */
export const ms = (seconds: number, reduced: Reduced = false): number =>
  reduced ? 0 : Math.round(seconds * 1000);
