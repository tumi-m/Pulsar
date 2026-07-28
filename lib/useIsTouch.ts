"use client";

import { useEffect, useState } from "react";

/**
 * True on devices with no hover (phones/tablets).
 *
 * Controls that only appear on hover are unreachable on touch: framer-motion's
 * hover gesture filters out touch pointers, and CSS `group-hover` never fires.
 * Components use this to render those controls permanently instead, so actions
 * like favourite / add-to-crate / remove are actually usable on a phone.
 *
 * Starts `false` so server and first client render agree (no hydration
 * mismatch), then corrects on mount.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const sync = () => setIsTouch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isTouch;
}
