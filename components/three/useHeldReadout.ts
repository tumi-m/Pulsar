"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough to read "Artist — Title" after a quick tap. */
export const READOUT_LINGER_MS = 2400;

/**
 * The crate's LCD readout: the held record's label while it's held, and for
 * a moment after it's let go (a tap-to-toss is held for a fraction of a
 * second), then nothing, so the page's hint comes back. Feed it the scene's
 * `onDig` (label | null); the returned callback is stable, so the memoised
 * canvas never re-renders for it.
 */
export function useHeldReadout(lingerMs = READOUT_LINGER_MS): [string | null, (label: string | null) => void] {
  const [readout, setReadout] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onDig = useCallback(
    (label: string | null) => {
      clearTimeout(timer.current);
      if (label !== null) setReadout(label);
      else timer.current = setTimeout(() => setReadout(null), lingerMs);
    },
    [lingerMs],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return [readout, onDig];
}
