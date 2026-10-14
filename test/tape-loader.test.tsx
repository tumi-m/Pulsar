import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import { Component, useEffect, type ReactNode } from "react";
import type { DotLottieReactProps } from "@lottiefiles/dotlottie-react";
import { LOOP_SECONDS, REELS, reelTurns } from "../scripts/motion/build-lottie";

/**
 * components/TapeLoader.tsx: a decoration that must never take the page down,
 * and that moves from its first frame.
 *
 * The player chunk is mocked: `lib.fail` makes the import reject the way a
 * ChunkLoadError does offline, and the fake player hands TapeLoader a dotLottie
 * instance whose "load" the test fires by hand.
 */

const lib = vi.hoisted(() => ({
  fail: false,
  reduce: false,
  imports: 0,
  setWasmUrl: vi.fn(),
  props: null as DotLottieReactProps | null,
  loaded: [] as (() => void)[],
}));

/** The player chunk. A factory that throws isn't cached, so the next import runs it again. */
function playerChunk() {
  lib.imports++;
  if (lib.fail) throw new Error("ChunkLoadError: Loading chunk 6153 failed.");
  return {
    setWasmUrl: lib.setWasmUrl,
    DotLottieReact: (props: DotLottieReactProps) => {
      lib.props = props;
      useEffect(() => {
        props.dotLottieRefCallback?.({
          isLoaded: false,
          addEventListener: (_: string, fn: () => void) => lib.loaded.push(fn),
          removeEventListener: () => {},
        } as never);
      }, [props]);
      return <canvas data-testid="player" />;
    },
  };
}

vi.mock("@/lib/motion", () => ({ useReducedMotion: () => lib.reduce }));

/** Stands in for app/error.tsx: if this renders, the route would have died. */
class RouteError extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? <p>Something skipped</p> : this.props.children;
  }
}

async function freshLoader() {
  // Fresh modules per test, so one test's loaded player can't leak into the next.
  vi.resetModules();
  vi.doMock("@lottiefiles/dotlottie-react", playerChunk);
  return (await import("@/components/TapeLoader")).TapeLoader;
}

const flush = () => act(async () => {});

beforeEach(() => {
  cleanup();
  Object.assign(lib, { fail: false, reduce: false, imports: 0, props: null, loaded: [] });
  lib.setWasmUrl.mockClear();
});

describe("TapeLoader", () => {
  it("keeps the CSS reels and the page when the player chunk fails to load", async () => {
    lib.fail = true;
    const TapeLoader = await freshLoader();
    const { container, queryByText, queryByTestId } = render(
      <RouteError>
        <TapeLoader />
      </RouteError>,
    );
    await flush();

    expect(lib.imports).toBe(1);
    expect(queryByText("Something skipped")).toBeNull();
    expect(queryByTestId("player")).toBeNull();
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "loading");
    expect(container.querySelectorAll("[data-reel]")).toHaveLength(2);
  });

  it("tries again on the next loader once a failed load is past, and plays", async () => {
    lib.fail = true;
    const TapeLoader = await freshLoader();
    const first = render(<TapeLoader />);
    await flush();
    first.unmount();

    // Back online: the next "thinking" row must not inherit the failure.
    lib.fail = false;
    const { container, findByTestId } = render(<TapeLoader />);
    await findByTestId("player");
    expect(lib.imports).toBe(2);
    expect(lib.setWasmUrl).toHaveBeenCalledWith("/lottie/dotlottie-player.wasm");
    expect(lib.props).toMatchObject({ src: "/lottie/tape-loader.json", autoplay: true, loop: true });

    const state = container.querySelector("[data-state]");
    expect(state).toHaveAttribute("data-state", "loading");
    // The player hands over its instance from an effect, which can land after
    // the canvas is in the DOM; firing "load" before then fired nothing.
    await waitFor(() => expect(lib.loaded.length).toBeGreaterThan(0));
    act(() => lib.loaded.forEach((fn) => fn()));
    expect(state).toHaveAttribute("data-state", "playing");
  });

  it("loads the player once, however many loaders mount", async () => {
    const TapeLoader = await freshLoader();
    const a = render(<TapeLoader />);
    await a.findByTestId("player");
    a.unmount();
    const b = render(<TapeLoader />);
    await b.findByTestId("player");
    expect(lib.imports).toBe(1);
    expect(lib.setWasmUrl).toHaveBeenCalledTimes(1);
  });

  it("holds the cassette on its first frame under reduced motion", async () => {
    lib.reduce = true;
    const TapeLoader = await freshLoader();
    const { container, findByTestId } = render(<TapeLoader />);
    await findByTestId("player");
    expect(lib.props?.autoplay).toBe(false);
    // The player hands over its instance from an effect, which can land after
    // the canvas is in the DOM; firing "load" before then fired nothing.
    await waitFor(() => expect(lib.loaded.length).toBeGreaterThan(0));
    act(() => lib.loaded.forEach((fn) => fn()));
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "still");
  });

  it("turns the fallback hubs like the Lottie's reels: anticlockwise, at the same speeds, still under reduced motion", async () => {
    const TapeLoader = await freshLoader();
    const { container } = render(<TapeLoader />);
    const hubs = [...container.querySelectorAll<HTMLElement>("[data-reel]")];
    const turns = reelTurns();

    // Supply first, then take-up, each a full turn in the time the Lottie's
    // reel takes to turn 360°.
    [turns.supply, turns.takeup].forEach((deg, i) => {
      const hub = hubs[i];
      expect(hub).toHaveClass("animate-spin", "motion-reduce:animate-none");
      expect(deg).toBeLessThan(0);
      expect(hub.style.animationDirection).toBe("reverse");
      expect(parseFloat(hub.style.animationDuration)).toBeCloseTo((LOOP_SECONDS * 360) / Math.abs(deg));
    });

    // And they sit where the Lottie's reels land on the 240x120 artboard.
    const packs = hubs.map((h) => h.parentElement!);
    [REELS.supply, REELS.takeup].forEach(({ x, r }, i) => {
      expect(parseFloat(packs[i].style.left)).toBeCloseTo(((x - r) / 240) * 100);
      expect(parseFloat(packs[i].style.width)).toBeCloseTo(((2 * r) / 240) * 100);
    });
    await waitFor(() => expect(lib.setWasmUrl).toHaveBeenCalled());
  });
});
