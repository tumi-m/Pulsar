"use client";

import { useEffect, useRef } from "react";

/**
 * Focus handling for Pulsar's overlays.
 *
 * Every panel in the app — Selector, Samples, the crate, a release, the
 * tracklist — opened without touching focus at all. Measured on the built app:
 * click Samples, and `document.activeElement` is still the Samples button.
 * Nothing is announced, and Tab walks the page *underneath* the panel, so a
 * keyboard visitor tabs through a grid they can no longer see, while the thing
 * they just opened is unreachable. Closing then leaves focus wherever it
 * happened to land.
 *
 * This gives an overlay the three behaviours it needs:
 *
 *   - focus moves into the panel when it opens,
 *   - Tab stays inside it while it is modal,
 *   - focus returns to whatever opened it when it closes.
 *
 * Modality follows the same rule as `useScrollLock`, so the two never disagree:
 * below 1024px an overlay is a sheet covering the page and is modal; at or
 * above, it is a side panel and the grid beside it stays genuinely usable, so
 * trapping Tab there would be wrong. Focus still moves in either way — that is
 * about knowing where you are, not about being held there.
 *
 * Stacking is handled: the tracklist opens over a release, which opens over the
 * grid. Only the topmost trap listens, so the one underneath doesn't fight it.
 */

/** Innermost open dialog last. Only its trap is live. */
const stack: HTMLElement[] = [];

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.hasAttribute("inert") || el.closest("[inert]")) return false;
    // A zero-size element is a visually-hidden control or one mid-animation;
    // focusing it would look to the visitor like focus vanished.
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export interface DialogOptions {
  /**
   * Force modality instead of deriving it from the viewport. Pass `false` for a
   * panel that is deliberately non-modal at every size.
   */
  modal?: boolean;
  /**
   * Change this when the panel swaps to different content and focus should
   * enter again. The Selector opens on a mode picker and only then shows a
   * conversation, so without this the cursor never reaches the input the
   * visitor has just asked for.
   */
  focusKey?: string | number | null;
}

export function useDialog<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  { modal, focusKey }: DialogOptions = {}
) {
  const ref = useRef<T | null>(null);

  const openerRef = useRef<HTMLElement | null>(null);

  // Remembering and restoring the opener is keyed on `open` alone. Folding it
  // into the effect below would mean a `focusKey` change — the Selector moving
  // from its mode picker to the conversation — bounced focus out to the trigger
  // and straight back in, which a screen reader reads aloud both times.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const panel = ref.current;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      // Only take focus back if it is still inside the panel that's closing —
      // if something else has deliberately claimed it, leave it alone.
      if (
        opener &&
        opener.isConnected &&
        (!document.activeElement ||
          document.activeElement === document.body ||
          (panel && panel.contains(document.activeElement)))
      ) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const panel = ref.current;
    if (!panel) return;

    const isModal = modal ?? !window.matchMedia("(min-width: 1024px)").matches;
    stack.push(panel);

    // One frame, so the panel's entrance animation has laid its contents out —
    // focusing a zero-height element scrolls the page to nowhere.
    const raf = requestAnimationFrame(() => {
      // A panel can name where focus should land. Without it you get whatever
      // is first in the DOM, which for the Selector is the Close button — a
      // conversation that opens with your cursor on "leave" gets the emphasis
      // exactly backwards.
      const preferred = panel.querySelector<HTMLElement>("[data-dialog-autofocus]");
      if (preferred) {
        if (document.activeElement !== preferred) preferred.focus();
        return;
      }
      if (panel.contains(document.activeElement)) return;
      const first = focusables(panel)[0];
      if (first) first.focus();
      else {
        // Nothing focusable yet (a panel still loading). Focus the panel itself
        // so a screen reader lands inside it and Tab continues from here.
        panel.setAttribute("tabindex", "-1");
        panel.focus({ preventScroll: true });
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !isModal) return;
      if (stack[stack.length - 1] !== panel) return; // an inner dialog owns this
      const items = focusables(panel);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      const i = stack.indexOf(panel);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [open, modal, focusKey]);

  return ref;
}
