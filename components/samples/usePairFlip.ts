"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { loadGsap } from "@/lib/gsapLoader";
import { boxIn, cablePath } from "./flipCable";

type MatchMedia = ReturnType<typeof import("gsap").gsap.matchMedia>;

const REDUCE = "(prefers-reduced-motion: reduce)";

/**
 * If GSAP turns up this long after the row came into view, skip the replay.
 * The timeline only ever adds to the finished row, so playing late breaks
 * nothing on screen, but its beat belongs to the moment the pair arrives. A
 * beat later the person is reading it, and a timecode scrambling under their
 * eyes reads as a glitch, not an entrance.
 */
const LATE_MS = 600;

/**
 * Path data for the cable between a pair's two covers, measured from the
 * rendered rows and kept current as they change height (a timing mark
 * appearing, a title wrapping, the viewport turning).
 *
 * A layout effect so the cable is in the very first paint — it's part of the
 * finished state, not something the animation adds.
 */
export function useCablePath(rootRef: RefObject<HTMLElement | null>): string | null {
  const [d, setD] = useState<string | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () =>
      setD(
        cablePath(
          boxIn(root.querySelector<HTMLElement>('[data-flip-row="source"] [data-flip-cover]'), root),
          boxIn(root.querySelector<HTMLElement>('[data-flip-row="flip"] [data-flip-cover]'), root)
        )
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [rootRef]);
  return d;
}

/**
 * Plays the "how it was flipped" timeline on a sample pair the first time it
 * is half on screen — once per `dataKey`, so a newly saved timing mark gets
 * its own replay, and the old timeline is reverted before the new one exists.
 *
 * The row is complete and interactive without any of this: GSAP is fetched
 * only when a row is actually seen, only for people who haven't asked for
 * reduced motion, and if it fails to load nothing changes on screen.
 */
export function usePairFlip(rootRef: RefObject<HTMLElement | null>, dataKey: string) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    // Reduced motion: the markup already is the final state. Don't even
    // download GSAP to decide to do nothing.
    if (window.matchMedia?.(REDUCE).matches) return;

    let alive = true;
    let mm: MatchMedia | null = null;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const seenAt = performance.now();
        Promise.all([loadGsap(), import("./flipTimeline")])
          .then(([{ gsap }, { buildFlipTimeline }]) => {
            if (!alive || performance.now() - seenAt > LATE_MS) return;
            const media = gsap.matchMedia(root);
            mm = media;
            // matchMedia owns the reduced-motion switch for the life of the
            // timeline: if the preference flips mid-flight, GSAP reverts it to
            // the natural (final) state and this runs again with `reduce` set.
            media.add({ reduce: REDUCE, motion: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
              if (ctx.conditions?.reduce) return;
              buildFlipTimeline(gsap, root)?.eventCallback("onComplete", () => {
                // Every tween ends on the markup's own state, so reverting is
                // invisible — and it strips the inline dasharray, transforms
                // and opacity GSAP left behind, which would otherwise fight
                // React (a re-measured cable longer than its frozen dash).
                // Deferred a frame: don't tear down a timeline from inside
                // its own callback.
                requestAnimationFrame(() => media.revert());
              });
            });
          })
          .catch(() => {
            /* GSAP didn't load — the row is already complete without it */
          });
      },
      { threshold: 0.5 }
    );
    io.observe(root);

    return () => {
      alive = false;
      io.disconnect();
      mm?.revert();
    };
  }, [rootRef, dataKey]);
}
