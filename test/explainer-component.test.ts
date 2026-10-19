import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";

/**
 * components/SampleExplainer.tsx — the "How sampling works" card in the
 * Samples panel.
 *
 * The real module is a canvas renderer jsdom can't run, so the runtime import
 * of /explainers/project.js (the scene plus the player element) is mocked: it
 * registers a stand-in element that records what the card does to it, and can
 * be told to fail. The reduced-motion preference is a live matchMedia stub:
 * motion's hook reads it once and then listens.
 */

const env = vi.hoisted(() => {
  const state = {
    reduce: false,
    imports: 0,
    /** How many of the next project.js imports fail, as a dropped connection would. */
    failProject: 0,
    /** Player elements constructed, across every copy of the module. */
    created: 0,
    listeners: [] as (() => void)[],
  };
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("prefers-reduced-motion") ? state.reduce : false;
    },
    media: query,
    onchange: null,
    addListener: (fn: () => void) => state.listeners.push(fn),
    removeListener: () => {},
    addEventListener: (_: string, fn: () => void) => state.listeners.push(fn),
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return state;
});

/** Stands in for <motion-canvas-player>: just the surface the card uses. */
class FakePlayer extends HTMLElement {
  playing = false;
  setPlaying = vi.fn((p: boolean) => {
    this.playing = p;
  });
  /** Core's Player: the card only ever rewinds it. */
  player = { requestReset: vi.fn() };
  constructor() {
    super();
    env.created++;
  }
}

/** What importing the built explainer gives the card. */
function projectModule() {
  env.imports++;
  if (env.failProject > 0) {
    env.failProject--;
    throw new Error("project.js: network error");
  }
  if (!customElements.get("motion-canvas-player")) {
    customElements.define("motion-canvas-player", FakePlayer);
  }
  return { default: {} };
}

vi.mock("/explainers/project.js", () => projectModule());
// The URL a retry asks under, since the browser keeps the failed one.
vi.mock("/explainers/project.js?retry=1", () => projectModule());

const SOURCE = fs.readFileSync(path.resolve(__dirname, "../components/SampleExplainer.tsx"), "utf8");

type Mod = typeof import("@/components/SampleExplainer");
let mod: Mod;

beforeAll(async () => {
  mod = await import("@/components/SampleExplainer");
});

afterEach(() => {
  cleanup();
  env.reduce = false;
  env.listeners.forEach((fn) => fn());
});

const player = () => document.querySelector("motion-canvas-player") as FakePlayer | null;

/**
 * A copy of the module with nothing loaded and no player made yet: the
 * component keeps both at module scope, so the tests above have filled them.
 */
async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import("@/components/SampleExplainer");
}

describe("SampleExplainer — loading", () => {
  it("never imports the player statically, so it stays out of the home page's bundle", () => {
    expect(SOURCE).not.toMatch(/^\s*import\s[^;]*["']@motion-canvas\//m);
    expect(SOURCE).not.toMatch(/require\(\s*["']@motion-canvas\//);
    // The runtime import must be one webpack leaves alone, of a built file.
    expect(SOURCE).toMatch(/import\(\s*\/\*\s*webpackIgnore:\s*true\s*\*\//);
  });

  it("points at the file the explainer build actually produces", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../public", `.${mod.EXPLAINER_PROJECT}`))).toBe(true);
  });

  it("does nothing until it is opened", () => {
    const before = env.imports;
    const { getByRole } = render(createElement(mod.SampleExplainer));
    const toggle = getByRole("button", { name: /how sampling works/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(player()).toBeNull();
    expect(env.imports).toBe(before);
  });
});

describe("SampleExplainer — playback", () => {
  it("opens into an autoplaying player sized to its box, and pauses on a tap", async () => {
    const { getByRole } = render(createElement(mod.SampleExplainer));
    fireEvent.click(getByRole("button", { name: /how sampling works/i }));
    expect(getByRole("button", { name: /how sampling works/i })).toHaveAttribute("aria-expanded", "true");

    await waitFor(() => expect(player()).not.toBeNull());
    const el = player()!;
    expect(el.getAttribute("src")).toBe(mod.EXPLAINER_PROJECT);
    expect(el.getAttribute("quality")).toMatch(/^(0\.25|0\.5|0\.75|1)$/);
    expect(el).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(el.getAttribute("auto")).toBe("true"));

    const surface = getByRole("button", { name: "Pause the explainer" });
    // The frame describes the whole explainer, not just "video".
    const desc = document.getElementById(surface.getAttribute("aria-describedby")!);
    expect(desc?.textContent).toMatch(/every record is a branch\. dig the chain\./i);

    fireEvent.click(surface);
    expect(el.hasAttribute("auto")).toBe(false);
    expect(el.setPlaying).toHaveBeenLastCalledWith(false);
    expect(getByRole("button", { name: "Play the explainer" })).toBeInTheDocument();
  });

  it("with reduced motion, sits on the title frame until someone presses play", async () => {
    act(() => {
      env.reduce = true;
      env.listeners.forEach((fn) => fn());
    });
    const { getByRole } = render(createElement(mod.SampleExplainer));
    fireEvent.click(getByRole("button", { name: /how sampling works/i }));
    await waitFor(() => expect(player()).not.toBeNull());
    const el = player()!;
    const surface = await waitFor(() => getByRole("button", { name: "Play the explainer" }));
    expect(el.hasAttribute("auto")).toBe(false);

    fireEvent.click(surface);
    expect(el.getAttribute("auto")).toBe("true");
  });

  it("takes the player out of the page, paused, when the card closes", async () => {
    const { getByRole } = render(createElement(mod.SampleExplainer));
    const toggle = getByRole("button", { name: /how sampling works/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(player()).not.toBeNull());
    const el = player()!;
    await waitFor(() => expect(el.getAttribute("auto")).toBe("true"));
    fireEvent.click(toggle);
    await waitFor(() => expect(player()).toBeNull());
    // Detached, the real element deactivates its Player; paused first, so it
    // wakes paused and the card decides whether it plays.
    expect(el.isConnected).toBe(false);
    expect(el.hasAttribute("auto")).toBe(false);
    expect(el.setPlaying).toHaveBeenLastCalledWith(false);
  });
});

describe("SampleExplainer — one player per page", () => {
  it("reuses a single player however often the card opens, from the title frame each time", async () => {
    const fresh = await freshModule();
    const before = env.created;
    const { getByRole } = render(createElement(fresh.SampleExplainer));
    const toggle = getByRole("button", { name: /how sampling works/i });

    let first: FakePlayer | null = null;
    for (let i = 0; i < 4; i++) {
      fireEvent.click(toggle);
      await waitFor(() => expect(player()).not.toBeNull());
      const el = player()!;
      first ??= el;
      expect(el).toBe(first);
      await waitFor(() => expect(el.getAttribute("auto")).toBe("true"));
      fireEvent.click(toggle);
      await waitFor(() => expect(player()).toBeNull());
    }
    // Each 3.17.2 Player stays subscribed to the shared project for good, so
    // a player per open would be a player leaked per open.
    expect(env.created - before).toBe(1);
    expect(first!.player.requestReset).toHaveBeenCalledTimes(4);
  });

  it("closing before anything has loaded makes no player at all", async () => {
    const fresh = await freshModule();
    const before = env.created;
    const { getByRole } = render(createElement(fresh.SampleExplainer));
    const toggle = getByRole("button", { name: /how sampling works/i });
    fireEvent.click(toggle);
    // Still loading: the frame says so rather than offering to pause.
    expect(getByRole("button", { name: "Loading the explainer" })).toBeInTheDocument();
    fireEvent.click(toggle);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(player()).toBeNull();
    expect(env.created - before).toBe(0);
  });

  it("a project that fails to load lands on Try again, which recovers", async () => {
    const fresh = await freshModule();
    // resetModules keeps vi.mock's cached module; re-registering drops it, and
    // a factory that throws isn't cached, so the retry imports afresh.
    vi.doMock("/explainers/project.js", () => projectModule());
    env.failProject = 1;

    // The visibility check, as a browser runs it: a frame the error state has
    // swapped out reads as off screen, and a retried player must not end up
    // watching that one (it would never play).
    type Observer = { cb: IntersectionObserverCallback; targets: Element[] };
    const observers = new Set<Observer>();
    const report = (o: Observer, t: Element) =>
      o.cb([{ isIntersecting: t.isConnected, target: t } as IntersectionObserverEntry], {} as IntersectionObserver);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        o: Observer;
        constructor(cb: IntersectionObserverCallback) {
          this.o = { cb, targets: [] };
          observers.add(this.o);
        }
        observe(t: Element) {
          this.o.targets.push(t);
          queueMicrotask(() => report(this.o, t));
        }
        disconnect() {
          observers.delete(this.o);
        }
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );

    try {
      const { getByRole, findByRole, queryByRole } = render(createElement(fresh.SampleExplainer));
      fireEvent.click(getByRole("button", { name: /how sampling works/i }));

      const retry = await findByRole("button", { name: /try again/i });
      // Not the player's own error box under a pause control.
      expect(player()).toBeNull();
      expect(queryByRole("button", { name: /pause the explainer/i })).toBeNull();
      act(() => observers.forEach((o) => o.targets.forEach((t) => report(o, t))));

      fireEvent.click(retry);
      await waitFor(() => expect(player()).not.toBeNull());
      // Asked under a new URL, and the element is pointed at that same one so
      // its own import is a cache hit.
      expect(player()!.getAttribute("src")).toBe(`${fresh.EXPLAINER_PROJECT}?retry=1`);
      act(() => observers.forEach((o) => o.targets.forEach((t) => report(o, t))));
      await waitFor(() => expect(player()!.getAttribute("auto")).toBe("true"));
      expect(getByRole("button", { name: "Pause the explainer" })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("explainerQuality", () => {
  it("draws enough pixels for the box and no more, in quarter steps", () => {
    // A 358-px phone slot at 3x needs ~1074 px of the 1920 scene.
    expect(mod.explainerQuality(358, 3)).toBe(0.75);
    // The desktop panel, ~526 px wide at 2x.
    expect(mod.explainerQuality(526, 2)).toBe(0.75);
    expect(mod.explainerQuality(526, 1)).toBe(0.5);
    expect(mod.explainerQuality(1920, 2)).toBe(1);
  });

  it("never drops below a quarter, whatever the box reports", () => {
    expect(mod.explainerQuality(0, 1)).toBe(0.25);
    expect(mod.explainerQuality(-10, 0)).toBe(0.25);
    expect(mod.explainerQuality(100, NaN)).toBe(0.25);
  });
});
