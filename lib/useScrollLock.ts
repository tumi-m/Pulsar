"use client";

import { useEffect } from "react";

/**
 * Locks background page scroll while an overlay is open — fixing the mobile
 * glitch where the page scrolls *behind* a sheet/modal (scroll-bleed) and the
 * body jumps when the sheet closes.
 *
 * - Ref-counted, so stacked overlays (e.g. tracklist → sample page) don't
 *   unlock the page early.
 * - Mobile/tablet only: on desktop (≥1024px) overlays are side panels and the
 *   grid on the other half must stay scrollable, so we leave native scroll be.
 * - Uses the iOS-safe `position: fixed` technique and restores the exact scroll
 *   position on release.
 */
let locks = 0;
let savedY = 0;

function apply() {
  savedY = window.scrollY;
  const b = document.body;
  b.style.position = "fixed";
  b.style.top = `-${savedY}px`;
  b.style.left = "0";
  b.style.right = "0";
  b.style.width = "100%";
}

function release() {
  const b = document.body;
  b.style.position = "";
  b.style.top = "";
  b.style.left = "";
  b.style.right = "";
  b.style.width = "";
  window.scrollTo(0, savedY);
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    // Desktop overlays are side panels — keep the page scrollable.
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    if (locks === 0) apply();
    locks++;
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0) release();
    };
  }, [active]);
}
