import { describe, it, expect, beforeAll } from "vitest";
import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { boxIn, cablePath, type Box } from "@/components/samples/flipCable";
import {
  buildFlipTimeline,
  FLIP_MAX_SECONDS,
  PULSE_SCALE,
  SCRAMBLE_CHARS,
} from "@/components/samples/flipTimeline";

/**
 * The sample pair's "how it was flipped" choreography: the cable geometry it
 * draws along, and the timeline itself, built with the real GSAP core.
 *
 * jsdom has no SVG geometry (getBBox / getTotalLength / getCTM), so DrawSVG and
 * MotionPath are stood in for by inert plugins of the same name — the timeline's
 * shape is what's under test, not those plugins' maths. ScrambleText only
 * touches innerHTML, so the real one runs.
 */

beforeAll(() => {
  const inert = (name: string) => ({ name, init: () => true });
  gsap.registerPlugin(inert("drawSVG"), inert("motionPath"), ScrambleTextPlugin);
});

describe("cablePath", () => {
  const cover = (y: number): Box => ({ x: 12, y, w: 48, h: 48 });

  it("runs from the source's cover up to the flip's, inset from both", () => {
    // flip on top (y 10..58), source below (y 120..168)
    const d = cablePath(cover(120), cover(10))!;
    expect(d).toMatch(/^M36 116C/); // source top-centre, 4px clear of the cover
    expect(d).toMatch(/ 36 62$/); // flip bottom-centre, 4px clear of the cover
  });

  it("sways sideways a little — never into the title column", () => {
    const d = cablePath(cover(400), cover(10))!; // a very tall gap
    const xs = d
      .replace(/^M/, "")
      .split(/[C ]/)
      .filter((_, i) => i % 2 === 0)
      .map(Number);
    expect(Math.max(...xs)).toBeLessThanOrEqual(36 + 7);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(36 - 7);
  });

  it("draws nothing when there's no room or no covers", () => {
    expect(cablePath(null, cover(10))).toBeNull();
    expect(cablePath(cover(10), null)).toBeNull();
    expect(cablePath(cover(60), cover(10))).toBeNull(); // touching
    expect(cablePath(cover(10), cover(120))).toBeNull(); // upside down
    expect(cablePath({ x: 0, y: NaN, w: 48, h: 48 }, cover(10))).toBeNull();
  });
});

describe("boxIn", () => {
  const place = (el: HTMLElement, left: number, top: number, parent: Element | null) => {
    Object.defineProperty(el, "offsetLeft", { value: left });
    Object.defineProperty(el, "offsetTop", { value: top });
    Object.defineProperty(el, "offsetWidth", { value: 48 });
    Object.defineProperty(el, "offsetHeight", { value: 48 });
    Object.defineProperty(el, "offsetParent", { value: parent });
  };

  it("sums offsets up the offsetParent chain to the root", () => {
    const root = document.createElement("div");
    const mid = document.createElement("div");
    const el = document.createElement("div");
    place(mid, 0, 100, root);
    place(el, 12, 10, mid);
    expect(boxIn(el, root)).toEqual({ x: 12, y: 110, w: 48, h: 48 });
  });

  it("returns null for an element that isn't inside the root", () => {
    const root = document.createElement("div");
    const el = document.createElement("div");
    place(el, 12, 10, document.body);
    Object.defineProperty(document.body, "offsetParent", { value: null, configurable: true });
    expect(boxIn(el, root)).toBeNull();
    expect(boxIn(null, root)).toBeNull();
  });
});

/** The pair's markup, as SamplePage renders it. */
function pair({ times = true, cable = true, trail = true } = {}) {
  const root = document.createElement("div");
  root.innerHTML = `
    <div data-flip-row="flip">
      <div data-flip-cover=""></div>
      ${times ? '<button>▶ <span data-flip-time="">0:42</span></button>' : ""}
    </div>
    <div data-flip-row="source">
      <div data-flip-cover=""></div>
      ${times ? '<button>▶ <span data-flip-time="">1:15</span></button>' : ""}
    </div>
    ${
      cable
        ? `<svg>
            <path data-flip-cable="" d="M36 116C43 98 29 80 36 62"></path>
            ${trail ? '<path data-flip-trail="" d="M36 116C43 98 29 80 36 62" opacity="0"></path>' : ""}
            <g data-flip-dot="" opacity="0"></g>
          </svg>`
        : ""
    }`;
  document.body.appendChild(root);
  const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
  return {
    root,
    flipCover: $('[data-flip-row="flip"] [data-flip-cover]'),
    sourceCover: $('[data-flip-row="source"] [data-flip-cover]'),
    flipTime: $('[data-flip-row="flip"] [data-flip-time]'),
    sourceTime: $('[data-flip-row="source"] [data-flip-time]'),
    cable: $("[data-flip-cable]"),
    trail: $("[data-flip-trail]"),
    dot: $("[data-flip-dot]"),
  };
}

/** Hidden the way the markup or GSAP's autoAlpha hides it. */
const invisible = (el: Element) => {
  const { opacity, visibility } = (el as HTMLElement).style;
  return opacity === "0" || visibility === "hidden" || (opacity === "" && el.getAttribute("opacity") === "0");
};

type Child = ReturnType<ReturnType<typeof gsap.timeline>["getChildren"]>[number];
const tweensOf = (tl: ReturnType<typeof gsap.timeline>, target: Element) =>
  tl.getChildren(true, true, false).filter((t: Child) => (t as gsap.core.Tween).targets().includes(target)) as gsap.core.Tween[];

describe("buildFlipTimeline", () => {
  it("does nothing without both covers", () => {
    const root = document.createElement("div");
    expect(buildFlipTimeline(gsap, root)).toBeNull();
  });

  it(`finishes within ${FLIP_MAX_SECONDS}s`, () => {
    const p = pair();
    const tl = buildFlipTimeline(gsap, p.root)!;
    expect(tl.duration()).toBeGreaterThan(0.5);
    expect(tl.duration()).toBeLessThanOrEqual(FLIP_MAX_SECONDS);
    tl.kill();
  });

  it("puts every part of the pair on ONE timeline", () => {
    const p = pair();
    const tl = buildFlipTimeline(gsap, p.root)!;
    for (const el of [p.flipCover, p.sourceCover, p.trail, p.dot, p.flipTime, p.sourceTime]) {
      expect(tweensOf(tl, el).length, el.outerHTML).toBeGreaterThan(0);
    }
    const draw = tweensOf(tl, p.trail).find((t) => t.vars.drawSVG)!;
    expect(draw.vars.drawSVG).toBe("0% 100%");
    const ride = tweensOf(tl, p.dot).find((t) => t.vars.motionPath)!;
    expect((ride.vars.motionPath as { path: Element }).path).toBe(p.cable);
    // The signal rides the cable exactly as it draws.
    expect(ride.startTime()).toBeCloseTo(draw.startTime());
    expect(ride.duration()).toBeCloseTo(draw.duration());
    tl.kill();
  });

  // The pair is complete, and often on screen, before this timeline exists:
  // during the card's entrance, while GSAP downloads, while a scrolled-to pair
  // climbs to half visible. Hiding any of it then reads as the page glitching.
  it("never hides what is already painted: covers stay opaque, the resting cable is untouched", () => {
    const p = pair();
    const tl = buildFlipTimeline(gsap, p.root)!;
    expect(tweensOf(tl, p.cable)).toHaveLength(0);
    for (const cover of [p.flipCover, p.sourceCover]) {
      for (const t of tweensOf(tl, cover)) {
        expect(t.vars).not.toHaveProperty("autoAlpha");
        expect(t.vars).not.toHaveProperty("opacity");
        expect(t.vars).toMatchObject({ scale: PULSE_SCALE, yoyo: true, repeat: 1 });
      }
    }
    for (let i = 0; i <= 48; i++) {
      tl.progress(i / 48);
      for (const cover of [p.flipCover, p.sourceCover]) {
        expect(cover.style.opacity, `at ${i}/48`).toBe("");
        expect(cover.style.visibility, `at ${i}/48`).toBe("");
        expect(Number(gsap.getProperty(cover, "scale")), `at ${i}/48`).toBeGreaterThanOrEqual(1);
      }
      expect(p.cable.getAttribute("style")).toBeNull();
    }
    tl.kill();
  });

  it("changes nothing visible on the frame it is built", () => {
    const p = pair();
    const tl = buildFlipTimeline(gsap, p.root)!;
    // from()/fromTo() render their start state immediately; only the
    // invisible overlays may take one.
    for (const el of [p.flipCover, p.sourceCover, p.cable]) {
      expect(el.getAttribute("style") ?? "", el.outerHTML).toBe("");
    }
    expect(invisible(p.trail)).toBe(true);
    expect(invisible(p.dot)).toBe(true);
    expect(p.flipTime.textContent).toBe("0:42");
    expect(p.sourceTime.textContent).toBe("1:15");
    tl.kill();
  });

  it("lights the trail only while the signal climbs, then lets it go", () => {
    const p = pair();
    const tl = buildFlipTimeline(gsap, p.root)!;
    const draw = tweensOf(tl, p.trail).find((t) => t.vars.drawSVG)!;
    tl.time(draw.startTime() / 2);
    expect(invisible(p.trail)).toBe(true);
    tl.time(draw.startTime() + draw.duration() / 2);
    expect(invisible(p.trail)).toBe(false);
    expect(invisible(p.dot)).toBe(false);
    tl.progress(1);
    expect(invisible(p.trail)).toBe(true);
    expect(invisible(p.dot)).toBe(true);
    tl.kill();
  });

  it("sequences with the position parameter: source first, flip's timing resolves as the signal lands", () => {
    const p = pair();
    const tl = buildFlipTimeline(gsap, p.root)!;
    const start = (el: Element) => Math.min(...tweensOf(tl, el).map((t) => t.startTime()));
    expect(start(p.sourceCover)).toBeLessThan(start(p.flipCover));

    const land = tl.labels.land;
    const ride = tweensOf(tl, p.dot).find((t) => t.vars.motionPath)!;
    expect(ride.endTime()).toBeCloseTo(land);

    const reveal = (el: Element) => {
      const t = tweensOf(tl, el).find((x) => x.vars.scrambleText)!;
      return t.startTime() + (t.vars.scrambleText as { revealDelay: number }).revealDelay;
    };
    expect(reveal(p.sourceTime)).toBeLessThan(land);
    expect(reveal(p.flipTime)).toBeGreaterThanOrEqual(land);
    tl.kill();
  });

  it("scrambles timecodes with digits only and resolves to the original text", () => {
    const p = pair();
    const tl = buildFlipTimeline(gsap, p.root)!;
    const vars = tweensOf(tl, p.flipTime)[0].vars.scrambleText as { text: string; chars: string };
    expect(vars.text).toBe("0:42");
    expect(vars.chars).toBe(SCRAMBLE_CHARS);

    tl.progress(0.3); // signal still travelling — the flip's time is unresolved
    expect(p.flipTime.textContent).toMatch(/^\d{4}$/);
    tl.progress(1);
    expect(p.flipTime.textContent).toBe("0:42");
    expect(p.sourceTime.textContent).toBe("1:15");
    tl.kill();
  });

  it("ends on the natural state, so reverting on completion leaves no trace", () => {
    const p = pair();
    const ctx = gsap.context(() => {
      buildFlipTimeline(gsap, p.root)!.progress(1);
    });
    expect(gsap.getProperty(p.flipCover, "scale")).toBe(1);
    expect(gsap.getProperty(p.sourceCover, "scale")).toBe(1);
    ctx.revert();
    for (const el of [p.flipCover, p.sourceCover, p.cable, p.trail, p.dot]) {
      expect(el.getAttribute("style") ?? "", el.outerHTML).toBe("");
    }
    expect(p.flipTime.textContent).toBe("0:42");
    expect(p.trail.getAttribute("opacity")).toBe("0");
    expect(p.dot.getAttribute("opacity")).toBe("0");
  });

  it("still plays the covers + signal when no timing has been marked", () => {
    const p = pair({ times: false });
    const tl = buildFlipTimeline(gsap, p.root)!;
    expect(tl.getChildren().some((t) => t.vars.scrambleText)).toBe(false);
    expect(tweensOf(tl, p.trail).some((t) => t.vars.drawSVG)).toBe(true);
    expect(tweensOf(tl, p.dot).some((t) => t.vars.motionPath)).toBe(true);
    tl.kill();
  });

  it("still sends the signal along the cable when there's no trail to light", () => {
    const p = pair({ trail: false });
    const tl = buildFlipTimeline(gsap, p.root)!;
    expect(tl.getChildren().some((t) => t.vars.drawSVG)).toBe(false);
    expect(tweensOf(tl, p.dot).some((t) => t.vars.motionPath)).toBe(true);
    expect(tweensOf(tl, p.cable)).toHaveLength(0);
    tl.kill();
  });

  it("degrades to just the covers when the cable couldn't be measured", () => {
    const p = pair({ cable: false });
    const tl = buildFlipTimeline(gsap, p.root)!;
    expect(tl.duration()).toBeLessThanOrEqual(FLIP_MAX_SECONDS);
    expect(tl.getChildren().some((t) => t.vars.drawSVG || t.vars.motionPath)).toBe(false);
    tl.kill();
  });
});
