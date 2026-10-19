import { DUR } from "@/lib/motion";

/**
 * "How it was flipped": the choreography a sample pair plays once, when it
 * first scrolls into view.
 *
 *   0.00  the source record's cover kicks, as if the sample is being lifted
 *   0.12  a signal leaves it, riding the cable up and lighting a trail behind it
 *   0.68  the signal lands: the flip's cover takes the hit, and the trail
 *         fades back into the resting cable
 *   ----  timestamps (Space Mono, LCD green) scramble and resolve at their own
 *         moment. The source's resolves as the signal leaves it and the flip's
 *         as the signal arrives, so the numbers tell the same story as the
 *         cable: lifted HERE, dropped THERE.
 *
 * Under a second end to end. It's flavour on a page people come to read and
 * listen to, so it must never make them wait for it.
 *
 * It only ever ADDS to what is already painted. The pair is complete before
 * GSAP arrives (covers showing, cable drawn), and the row is often on screen
 * for a while before this runs: during the card's entrance, while GSAP
 * downloads, and while a scrolled-to pair climbs from its first pixel to half
 * visible. So the covers pulse from their resting scale rather than fading in
 * from nothing, and the resting cable is never touched. The draw-on happens on
 * a separate trail laid over it, which is invisible at rest.
 *
 * Every tween ends on the markup's natural state, which is what lets the hook
 * revert the whole thing on completion and hand the row back to React with no
 * inline styles left behind. This module is loaded on demand alongside GSAP
 * itself and receives `gsap` as an argument; it never imports it.
 */

type Gsap = typeof import("gsap").gsap;
type Timeline = ReturnType<Gsap["timeline"]>;

/** GSAP's names for lib/motion's curves: EASE.out is a quint-out (power4),
 *  EASE.inOut a cubic in-out (power2). */
const EASE_OUT = "power4.out";
const EASE_IN_OUT = "power2.inOut";

/** Only digits: these are timecodes, and a letter flashing through one reads
 *  as a glitch rather than a counter finding its place. */
export const SCRAMBLE_CHARS = "0123456789";

/** How far a cover swells on its beat. Up, never down: a cover that shrinks
 *  first reads as flinching away, not as being hit. */
export const PULSE_SCALE = 1.06;

/** The signal leaves at the top of the source's kick. */
const SIGNAL_AT = DUR.instant;
const SIGNAL_FOR = DUR.base * 2;

const AT = {
  lift: 0,
  signal: SIGNAL_AT,
  land: SIGNAL_AT + SIGNAL_FOR,
} as const;

/** Hard ceiling, checked by test/gsap-flip.test.ts. */
export const FLIP_MAX_SECONDS = 1.2;

export function buildFlipTimeline(gsap: Gsap, root: Element): Timeline | null {
  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const flipCover = q('[data-flip-row="flip"] [data-flip-cover]');
  const sourceCover = q('[data-flip-row="source"] [data-flip-cover]');
  const flipTime = q('[data-flip-row="flip"] [data-flip-time]');
  const sourceTime = q('[data-flip-row="source"] [data-flip-time]');
  const cable = q<SVGPathElement>("[data-flip-cable]");
  const trail = q<SVGPathElement>("[data-flip-trail]");
  const dot = q<SVGGElement>("[data-flip-dot]");
  if (!flipCover || !sourceCover) return null;

  const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
  tl.addLabel("lift", AT.lift).addLabel("signal", AT.signal).addLabel("land", AT.land);

  // One quick there-and-back from the cover's natural scale. A to() records
  // its start value when it first renders and yoyo returns to it, so nothing
  // is applied before the beat and nothing is left after it.
  const pulse = (cover: HTMLElement, at: string) =>
    tl.to(cover, { scale: PULSE_SCALE, duration: DUR.instant, ease: "power2.out", yoyo: true, repeat: 1 }, at);
  pulse(sourceCover, "lift");
  pulse(flipCover, "land");

  if (cable) {
    if (trail) {
      // The trail is hidden by its own markup until the signal leaves. Its
      // from-state (drawn to nothing) is applied when the timeline is built,
      // so the trail is already empty, out of sight, when it's shown.
      tl.set(trail, { autoAlpha: 1 }, "signal")
        .fromTo(
          trail,
          { drawSVG: "0% 0%" },
          { drawSVG: "0% 100%", duration: SIGNAL_FOR, ease: EASE_IN_OUT },
          "signal"
        )
        // Back into the resting cable as the flip's timing resolves.
        .to(trail, { autoAlpha: 0, duration: DUR.base, ease: "power1.out" }, "land");
    }
    if (dot) {
      tl.fromTo(dot, { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR.instant, ease: "none" }, "signal")
        .to(
          dot,
          {
            motionPath: { path: cable, align: cable, alignOrigin: [0.5, 0.5] },
            duration: SIGNAL_FOR,
            ease: EASE_IN_OUT,
          },
          "signal"
        )
        // Fades as it reaches the cover, so it reads as going INTO the record.
        .to(dot, { autoAlpha: 0, duration: DUR.instant, ease: "power1.in" }, `land-=${DUR.instant / 2}`);
    }
  }

  // Timestamps scramble from the first frame (revealDelay holds them
  // scrambled) and resolve left to right at their moment. Same text in as
  // out, so the element's width never changes in a monospace face. Only the
  // glyphs on screen change: the button they sit in is named by its
  // aria-label, so assistive tech never hears the scramble.
  const scramble = (el: HTMLElement | null, resolveAt: number, resolveFor: number) => {
    const text = el?.textContent?.trim();
    if (!el || !text) return;
    tl.to(
      el,
      {
        scrambleText: { text, chars: SCRAMBLE_CHARS, revealDelay: resolveAt, speed: 0.8 },
        duration: resolveAt + resolveFor,
        ease: "none",
      },
      0
    );
  };
  scramble(sourceTime, AT.signal + 0.06, DUR.base);
  scramble(flipTime, AT.land, DUR.base);

  return tl;
}
