"use client";

import { useSyncExternalStore } from "react";

/**
 * prefers-reduced-motion, followed live.
 *
 * lib/motion's useReducedMotion (Motion 12's) is a snapshot taken at mount —
 * its source says it doesn't auto-update. That's fine for a sheet that opens
 * and closes, but the Observatory runs for minutes: someone who turns on
 * Reduce Motion because the sweep and the drop bother them must see it stop
 * then, not after a reload.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = typeof window === "undefined" ? undefined : window.matchMedia?.(QUERY);
  if (!mq) return () => {};
  // Safari < 14 only has the deprecated listener API
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }
  mq.addListener(onChange);
  return () => mq.removeListener(onChange);
}

const read = () => window.matchMedia?.(QUERY).matches ?? false;
const readOnServer = () => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
