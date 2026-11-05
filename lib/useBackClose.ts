"use client";

import { useEffect, useRef } from "react";

/**
 * Closes an overlay with the Android hardware Back button (and the browser's
 * back gesture) instead of navigating away from the site, or with the Escape
 * key — the standard keyboard dismissal desktop users expect.
 *
 * Pushes a history entry when the overlay opens and closes it on `popstate`.
 * When the overlay is dismissed some other way (a close button, the scrim) the
 * pushed entry is popped back off so Back doesn't have to be pressed twice.
 *
 * Overlays stack — the tracklist opens over a release, which opens over the
 * grid — and only the TOP one may react. Each instance used to listen for
 * itself, which broke stacking two ways:
 *
 *  - Closing the inner overlay with its button called history.back(); the
 *    resulting popstate reached the OUTER overlay's still-attached listener,
 *    which closed as well. One tap on ✕ closed both.
 *  - Every instance listened for Escape on `window`. stopPropagation() can't
 *    stop other listeners on the same target, so one Escape closed the lot.
 *
 * Now there is one popstate and one keydown listener for the whole app, and
 * they act on the top of a stack. The history.back() a button-close issues is
 * counted and swallowed, so it can't be mistaken for the user pressing Back.
 */

interface Entry {
  id: number;
  close: () => void;
  /** Set when the user pressed Back for this overlay (its entry is already gone). */
  popped: boolean;
}

const stack: Entry[] = [];
let nextId = 0;
/** history.back() calls we issued ourselves, whose popstate must be ignored. */
let selfPops = 0;
let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", () => {
    if (selfPops > 0) {
      selfPops -= 1;
      return;
    }
    const top = stack[stack.length - 1];
    if (!top) return;
    top.popped = true;
    top.close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const top = stack[stack.length - 1];
    if (!top) return;
    e.stopPropagation();
    top.close();
  });
}

export function useBackClose(active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    install();

    const entry: Entry = { id: ++nextId, close: () => closeRef.current(), popped: false };
    stack.push(entry);
    // Marked with our id so we can tell our own entry from real navigation.
    window.history.pushState({ pulsarOverlay: entry.id }, "");

    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      // Closed by a button/scrim rather than Back — remove the entry we added,
      // and make sure the popstate that causes isn't read as a Back press.
      if (!entry.popped && window.history.state?.pulsarOverlay === entry.id) {
        selfPops += 1;
        window.history.back();
      }
    };
  }, [active]);
}
