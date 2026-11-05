"use client";

import { createContext, useContext } from "react";

/**
 * The Observatory's own time base.
 *
 * R3F zeroes `state.clock` whenever the frameloop mode changes, and the still
 * (reduced-motion) scene switches to on-demand rendering once it's done. A
 * frame drawn after that (a resize, a rotation) would then replay the
 * sequence from t=0: fog closed, wordmark gone. Everything choreographed
 * reads seconds-since-the-scene-mounted from here instead.
 */
export const SceneClock = createContext<{ start: number }>({ start: 0 });

/** Returns a reader for the scene's elapsed seconds (cheap; call it per frame). */
export function useSceneTime(): () => number {
  const { start } = useContext(SceneClock);
  return () => (performance.now() - start) / 1000;
}
