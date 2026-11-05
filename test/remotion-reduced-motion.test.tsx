import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Thumbnail } from "@remotion/player";
import { CrateRecap } from "@/remotion/CrateRecap";
import { recapDurationInFrames, recapPosterFrame, type CrateRecapProps } from "@/remotion/props";
import { DECK_TOP, RECAP_FPS, RECAP_HEIGHT, RECAP_WIDTH } from "@/remotion/tokens";

/**
 * The Crate Recap's reduced-motion form, checked on the rendered composition:
 * the Player in the Video sheet passes reducedMotion under
 * prefers-reduced-motion, and then nothing may travel, tilt or zoom at any
 * frame — entrances and exits are opacity only. The reels may turn in place
 * (the deck's, and the little ones on a generated cassette cover): the tape is
 * playing.
 */

const records = [
  { title: "GNX", artist: "Kendrick Lamar", year: "2024" },
  { title: "Brat", artist: "Charli xcx", year: "2024" },
  { title: "Blonde", artist: "Frank Ocean", year: "2016" },
];
const duration = recapDurationInFrames(records.length, RECAP_FPS);

function renderAt(props: CrateRecapProps, frame: number) {
  const view = render(
    <Thumbnail
      component={CrateRecap}
      inputProps={props}
      frameToDisplay={frame}
      durationInFrames={duration}
      compositionWidth={RECAP_WIDTH}
      compositionHeight={RECAP_HEIGHT}
      fps={RECAP_FPS}
      style={{ width: 270, height: 480 }}
    />
  );
  const root = view.container.querySelector<HTMLElement>(".__remotion-player > div");
  if (!root) throw new Error("composition did not render");
  return { root, unmount: view.unmount };
}

const numbers = (value: string) => (value.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
/** True when a translate/rotate value moves nothing ("", "none", "0px 0px", "0deg"). */
const still = (value: string) => numbers(value).every((n) => n === 0);
const unscaled = (value: string) => value === "" || value === "none" || numbers(value).every((n) => n === 1);

function deckOf(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("div")].find((el) => el.style.top === `${DECK_TOP}px`) ?? null;
}

/**
 * Square boxes hold drawn artwork — a cover, a reel, a screw head — whose
 * insides have fixed angles (screw slots, reel teeth) and turning hubs: the
 * reels spin in place, by design. Their contents are skipped; the boxes
 * themselves are checked (the outro's covers zoom in, in the full form).
 * Nothing that travels is square: the cards are 900 and 820 wide, height
 * auto; the deck is 900 × 320.
 */
const isArtwork = (el: HTMLElement) => /px$/.test(el.style.width) && el.style.width === el.style.height;

/**
 * A premounted Sequence: mounted a second early, frozen at its first frame and
 * hidden — by the Player with opacity 0 + pointer-events none, elsewhere with
 * display: none.
 */
const isPremounted = (el: HTMLElement) =>
  el.style.display === "none" || (el.style.opacity === "0" && el.style.pointerEvents === "none");

/** Not on screen yet, or inside a square artwork box. */
function skipped(el: HTMLElement, root: HTMLElement) {
  if (isPremounted(el)) return true;
  for (let up = el.parentElement; up && up !== root; up = up.parentElement) {
    if (isPremounted(up) || isArtwork(up)) return true;
  }
  return false;
}

/** Elements whose position, angle or size is being animated at this frame. */
function moving(root: HTMLElement) {
  const found: string[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    if (skipped(el, root)) continue;
    const s = el.style;
    // The backdrop's sheen: a fixed angle; under reduced motion a fixed place
    // too (checked across frames below).
    const sheen = s.backgroundImage.includes("rgba(242, 102, 44, 0.07)");
    if (!still(s.translate) && !sheen) found.push(`translate ${s.translate}`);
    if (!still(s.rotate) && !sheen) found.push(`rotate ${s.rotate}`);
    if (!unscaled(s.scale)) found.push(`scale ${s.scale}`);
    if (s.transform && !unscaled(s.transform)) found.push(`transform ${s.transform}`);
    // The outro's gradient bar draws in as a width wipe in the full form.
    if (s.backgroundImage.includes("118deg") && s.width !== "460px") found.push(`wipe ${s.width}`);
  }
  return found;
}

describe("Crate Recap reduced-motion form", () => {
  it("moves nothing at any frame, and holds the sheen still", () => {
    const props = { crateName: "Road Trip", records, reducedMotion: true };
    const sheens = new Set<string>();
    for (let frame = 0; frame < duration; frame += 3) {
      const { root, unmount } = renderAt(props, frame);
      expect([frame, moving(root)]).toEqual([frame, []]);
      const sheen = [...root.querySelectorAll<HTMLElement>("div")].find((el) =>
        el.style.backgroundImage.includes("rgba(242, 102, 44, 0.07)")
      );
      sheens.add(sheen?.style.translate ?? "missing");
      expect(deckOf(root)?.style.translate ?? "").toBe("");
      unmount();
    }
    expect([...sheens]).toHaveLength(1);
  }, 30_000);

  it("is a real difference: the full form flies the cards in", () => {
    const props = { crateName: "Road Trip", records };
    const { root, unmount } = renderAt(props, 3);
    const found = moving(root);
    unmount();
    expect(found.some((m) => m.startsWith("translate"))).toBe(true);
    expect(found.some((m) => m.startsWith("rotate"))).toBe(true);
  });

  it("has the title card and the deck in place at the poster frame, in both forms", () => {
    const poster = recapPosterFrame(RECAP_FPS);
    for (const reducedMotion of [true, false]) {
      const { root, unmount } = renderAt({ crateName: "Road Trip", records, reducedMotion }, poster);
      expect([reducedMotion, moving(root)]).toEqual([reducedMotion, []]);
      const card = [...root.querySelectorAll<HTMLElement>("div")].find((el) => el.style.top === "330px");
      expect(card).toBeTruthy();
      expect(card!.textContent).toContain("Road Trip");
      // Fully in: the card and everything written on it.
      for (const el of [card!, ...card!.querySelectorAll<HTMLElement>("*")]) {
        expect(el.style.opacity === "" ? 1 : Number(el.style.opacity)).toBe(1);
      }
      const deck = deckOf(root)!;
      expect(deck.style.opacity === "" ? 1 : Number(deck.style.opacity)).toBe(1);
      unmount();
    }
  });
});
