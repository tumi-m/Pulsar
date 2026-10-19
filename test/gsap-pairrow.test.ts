import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import type { Release } from "@/lib/types";

/**
 * A sample pair's row, as the flip timeline finds it: the timing button keeps
 * its real name while ScrambleText rewrites the digits, and a newly saved mark
 * replaces the scrambled span instead of updating a text node React no longer
 * shows.
 */

// The row needs none of the breakdown's heavier neighbours; keep the import
// to the component under test.
vi.mock("@/components/SampleGraph", () => ({ SampleGraph: () => null }));
vi.mock("@/components/player/MiniPlayer", () => ({ MiniPlayer: () => null }));
vi.mock("@/components/player/PlayerProvider", () => ({ usePlayer: () => ({}) }));

import { PairRow } from "@/components/SamplePage";
import { SCRAMBLE_CHARS } from "@/components/samples/flipTimeline";

beforeAll(() => {
  gsap.registerPlugin(ScrambleTextPlugin);
});

const release = {
  id: "sample:chic:good-times",
  artist: "Chic",
  title: "Good Times",
  artwork_url: "/cover.jpg",
} as Release;

const player = { current: null, playing: false, loading: false, play: vi.fn(), toggle: vi.fn() } as unknown as Parameters<
  typeof PairRow
>[0]["player"];

const row = (mark: number | null) =>
  createElement(PairRow, {
    slot: "flip",
    release,
    year: "1979",
    isSubject: false,
    player,
    mark,
    onMarkJump: () => {},
  });

/** Scramble the mark the way the flip timeline does, and stop halfway. */
function scrambleHalfway(span: Element) {
  const tween = gsap.to(span, {
    scrambleText: { text: span.textContent ?? "", chars: SCRAMBLE_CHARS, revealDelay: 0.5 },
    duration: 1,
    ease: "none",
    paused: true,
  });
  tween.progress(0.3);
  return tween;
}

describe("PairRow timing mark", () => {
  it("names the jump button by its timecode, not by the digits on screen", () => {
    const { container } = render(row(42));
    const span = container.querySelector("[data-flip-time]")!;
    expect(span.textContent).toBe("0:42");

    const tween = scrambleHalfway(span);
    expect(span.textContent).not.toBe("0:42");
    expect(span.textContent).toMatch(/^\d+$/);
    // Assistive tech still hears the real time mid-scramble.
    expect(screen.getByRole("button", { name: "Jump to 0:42 on YouTube" })).toBeTruthy();
    tween.kill();
  });

  it("mounts a fresh span for a new mark, even after ScrambleText has rewritten the old one", () => {
    const { container, rerender } = render(row(42));
    const old = container.querySelector("[data-flip-time]")!;
    scrambleHalfway(old).kill(); // left mid-scramble: innerHTML replaced, React's text node orphaned

    rerender(row(65));
    const spans = container.querySelectorAll("[data-flip-time]");
    expect(spans).toHaveLength(1);
    expect(spans[0]).not.toBe(old);
    expect(spans[0].textContent).toBe("1:05");
    expect(screen.getByRole("button", { name: "Jump to 1:05 on YouTube" })).toBeTruthy();
  });

  it("shows no timing button when nothing has been marked", () => {
    const { container } = render(row(null));
    expect(container.querySelector("[data-flip-time]")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Jump to/ })).toBeNull();
  });
});
