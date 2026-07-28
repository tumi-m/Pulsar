"use client";

import { useEffect, useRef } from "react";

/**
 * Closes an overlay with the Android hardware Back button (and the browser's
 * back gesture) instead of navigating away from the site.
 *
 * Pushes a history entry when the overlay opens and closes it on `popstate`.
 * When the overlay is dismissed some other way (a close button, the scrim) the
 * pushed entry is popped back off so Back doesn't have to be pressed twice.
 *
 * Stacked overlays each push their own entry, so Back peels them off one at a
 * time — top-most first — which is the behaviour users expect on mobile.
 */
export function useBackClose(active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    // Marked so we can tell our own entry apart from real navigation.
    window.history.pushState({ pulsarOverlay: true }, "");
    let poppedByUser = false;

    const onPop = () => {
      poppedByUser = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by a button/scrim rather than Back — remove the entry we added.
      if (!poppedByUser && window.history.state?.pulsarOverlay) {
        window.history.back();
      }
    };
  }, [active]);
}
