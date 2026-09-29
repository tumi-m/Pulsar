"use client";

import { EASE, ms } from "./motion";

/**
 * Fly a record's artwork into the crate button.
 *
 * Adding to the crate is Pulsar's one collecting gesture and it had no visual
 * consequence at all: the icon toggled state somewhere off-screen and that was
 * the whole acknowledgement. On a phone the crate button is usually not even in
 * view, so the tap read as if nothing had happened.
 *
 * Implemented imperatively with the Web Animations API on a cloned node rather
 * than as React state, for three reasons: it must not re-render the grid
 * mid-flight, it must survive the source element unmounting (a filter change
 * during the animation), and it is decoration — if anything here fails the add
 * has already happened regardless.
 */

/** Where the crate lives. Set by whichever control is currently mounted. */
let crateTargetSelector = "[data-crate-target]";

export function setCrateTargetSelector(selector: string) {
  crateTargetSelector = selector;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * @param source  the element to fly from — usually the artwork that was tapped
 * @param imageUrl optional explicit artwork; falls back to the source's own
 *                 background or <img>, so a placeholder tile still animates
 */
export function flyToCrate(source: Element | null, imageUrl?: string): void {
  if (typeof window === "undefined") return;
  // Motion for its own sake is exactly what this preference is about.
  if (prefersReducedMotion()) return;
  if (!source) return;

  const target = document.querySelector(crateTargetSelector);
  if (!target) return; // crate not on screen — nothing to fly to

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;

  const img = imageUrl ?? source.querySelector("img")?.getAttribute("src") ?? null;

  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    borderRadius: "12px",
    // Above every panel, below nothing — it is a transient overlay.
    zIndex: "90",
    pointerEvents: "none",
    backgroundColor: "#1a1726",
    backgroundImage: img ? `url(${JSON.stringify(img).slice(1, -1)})` : "none",
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: "0 12px 40px -8px rgba(0,0,0,.7)",
    willChange: "transform, opacity",
  } as CSSStyleDeclaration);
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.max(0.12, to.width / Math.max(from.width, 1));

  // An arc, not a straight line: the midpoint lifts, so it reads as a thrown
  // object rather than a linear tween.
  const lift = Math.min(120, Math.abs(dy) * 0.35 + 40);

  const anim = ghost.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + scale) / 2})`,
        opacity: 0.95,
        offset: 0.55,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.1, offset: 1 },
    ],
    {
      duration: ms(0.62),
      easing: `cubic-bezier(${EASE.inOut.join(",")})`,
      fill: "forwards",
    }
  );

  const cleanup = () => ghost.remove();
  anim.addEventListener("finish", cleanup);
  anim.addEventListener("cancel", cleanup);
  // Belt and braces: a backgrounded tab can leave the animation unfinished,
  // and an orphaned fixed-position node would sit over the UI forever.
  window.setTimeout(cleanup, 1500);

  pulseCrate(target);
}

/** A short recoil on the crate itself, so the arrival lands. */
function pulseCrate(target: Element) {
  const el = target as HTMLElement;
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.9)", offset: 0.45 },
      { transform: "scale(1.08)", offset: 0.72 },
      { transform: "scale(1)" },
    ],
    { duration: ms(0.42), easing: `cubic-bezier(${EASE.out.join(",")})`, delay: ms(0.42) }
  );
}
