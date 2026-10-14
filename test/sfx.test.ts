import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/sfx.ts against a fake howler. The module keeps its loaded state at module
 * level, so every test re-imports it from a fresh registry; `imports` counts how
 * many times "howler" was actually evaluated, which is the observable for "the
 * chunk was (not) downloaded".
 */

type Opts = {
  src: string[];
  html5: boolean;
  volume: number;
  preload: boolean;
  onload?: () => void;
  onloaderror?: () => void;
};

type FakeHowl = {
  opts: Opts;
  play: ReturnType<typeof vi.fn>;
  unload: ReturnType<typeof vi.fn>;
  _state: string;
  _webAudio: boolean;
  loaded(): void;
};

const h = {
  imports: 0,
  failImport: false,
  /** Model WebKit: a context starts suspended, and resume() only starts it
   *  inside a gesture — until it has been started once, after which WebKit
   *  lifts the rule. Off, it behaves like Chromium after any interaction. */
  webkit: false,
  inGesture: false,
  howls: [] as FakeHowl[],
  contexts: [] as FakeCtx[],
  Howler: null as null | {
    ctx: FakeCtx | null;
    masterGain: unknown;
    autoUnlock: boolean;
    autoSuspend: boolean;
  },
};

class FakeCtx {
  state = h.webkit ? "suspended" : "running";
  destination = { kind: "destination" };
  gains: Array<{ connect: ReturnType<typeof vi.fn> }> = [];
  private started = !h.webkit;
  private held: Array<() => void> = [];
  constructor() {
    h.contexts.push(this);
  }
  resume = vi.fn((): Promise<void> => {
    if (this.state === "closed") return Promise.reject(new DOMException("closed", "InvalidStateError"));
    // WebKit holds a resume made outside a gesture until one starts it.
    if (!this.started && !h.inGesture) return new Promise<void>((r) => this.held.push(r));
    this.started = true;
    this.state = "running";
    this.held.splice(0).forEach((r) => r());
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    if (this.state !== "closed") this.state = "suspended";
    return Promise.resolve();
  });
  close = vi.fn(() => {
    this.state = "closed";
    return Promise.resolve();
  });
  createGain = vi.fn(() => {
    const gain = { connect: vi.fn() };
    this.gains.push(gain);
    return gain;
  });
}

/** Run `fn` as if inside a user gesture (a click handler). */
function gesture<T>(fn: () => T): T {
  h.inGesture = true;
  try {
    return fn();
  } finally {
    h.inGesture = false;
  }
}
/** A real click somewhere on the page, inside a gesture. */
const tap = () => gesture(() => document.body.click());

/** A fresh fake "howler" module; runs each time the module is really imported. */
function fakeHowler() {
  if (h.failImport) throw new Error("ChunkLoadError");
  h.imports++;
  const Howler = { ctx: null as FakeCtx | null, masterGain: null as unknown, autoUnlock: true, autoSuspend: true };
  h.Howler = Howler;
  class Howl {
    opts: Opts;
    _state = "loading";
    _webAudio = true;
    play = vi.fn();
    unload = vi.fn(() => {
      this._state = "unloaded";
    });
    constructor(opts: Opts) {
      this.opts = opts;
      // Like the real thing: a Howl with no context opens one of its own
      // (outside any gesture), which is what lib/sfx must prevent.
      if (!Howler.ctx) Howler.ctx = new AudioContext() as unknown as FakeCtx;
      h.howls.push(this);
    }
    state() {
      return this._state;
    }
    loaded() {
      this._state = "loaded";
      this.opts.onload?.();
    }
  }
  return { Howl, Howler, default: { Howl, Howler } };
}

type Sfx = typeof import("@/lib/sfx");

let now = 10_000;
let current: Sfx | null = null;
async function fresh(): Promise<Sfx> {
  // The previous copy's document listeners outlive vi.resetModules; switching
  // it off removes them so they can't answer this test's taps. The stored
  // setting is put back: some tests reload on purpose to read it.
  if (current) {
    const stored = localStorage.getItem("pulsar_sfx_v1");
    current.setSfxEnabled(false);
    if (stored === null) localStorage.removeItem("pulsar_sfx_v1");
    else localStorage.setItem("pulsar_sfx_v1", stored);
  }
  vi.resetModules();
  vi.doMock("howler", fakeHowler);
  current = await import("@/lib/sfx");
  return current;
}
/** Let the dynamic import("howler") and its .then run. */
async function settle() {
  await vi.dynamicImportSettled();
  await flush();
}
/** Let resume() promises and their .then callbacks run. */
async function flush() {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}
const howl = (name: string) => h.howls.filter((x) => x.opts.src[0].includes(`/${name}.`)).at(-1)!;
const loadAll = () => h.howls.forEach((x) => x._state === "loading" && x.loaded());

beforeEach(() => {
  h.imports = 0;
  h.failImport = false;
  h.webkit = false;
  h.inGesture = false;
  h.howls.length = 0;
  h.contexts.length = 0;
  h.Howler = null;
  localStorage.clear();
  now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("AudioContext", FakeCtx);
});

afterEach(() => {
  act(() => current?.setSfxEnabled(false));
  current = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

describe("lib/sfx", () => {
  it("is off by default and the hook agrees", async () => {
    const sfx = await fresh();
    expect(sfx.sfxEnabled()).toBe(false);
    const { result } = renderHook(() => sfx.useSfxEnabled());
    expect(result.current[0]).toBe(false);
  });

  it("never imports howler (so never makes an AudioContext) while off", async () => {
    const sfx = await fresh();
    for (const n of ["key", "drop", "success", "error"] as const) sfx.playSfx(n);
    sfx.setSfxEnabled(false);
    await settle();
    expect(h.imports).toBe(0);
    expect(h.contexts).toHaveLength(0);
  });

  it("loads howler once on enable and preloads every sound quietly as webm then mp3", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    sfx.setSfxEnabled(true);
    sfx.playSfx("drop");
    await settle();
    sfx.playSfx("drop");
    await settle();

    expect(h.imports).toBe(1);
    expect(h.howls).toHaveLength(4);
    for (const x of h.howls) {
      expect(x.opts.src).toEqual([expect.stringMatching(/^\/sfx\/\w+\.webm$/), expect.stringMatching(/^\/sfx\/\w+\.mp3$/)]);
      expect(x.opts).toMatchObject({ html5: false, preload: true, volume: 0.35 });
    }
    // No Howler unlock (it reopens non-44.1 kHz contexts) or spare <audio>
    // pool, and only the one context, ours.
    expect(h.Howler?.autoUnlock).toBe(false);
    expect(h.contexts).toHaveLength(1);
    expect(h.Howler?.ctx).toBe(h.contexts[0]);
  });

  it("confirms the enable with the key click once it has decoded", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    expect(howl("key").play).not.toHaveBeenCalled();
    howl("key").loaded();
    expect(howl("key").play).toHaveBeenCalledTimes(1);
  });

  it("drops a confirmation that decodes too late to mean anything", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    now += 5000;
    howl("key").loaded();
    expect(howl("key").play).not.toHaveBeenCalled();
  });

  it("drops sounds requested before they have loaded instead of queueing them", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    sfx.playSfx("success");
    howl("success").loaded();
    expect(howl("success").play).not.toHaveBeenCalled();
    now += 100;
    sfx.playSfx("success");
    expect(howl("success").play).toHaveBeenCalledTimes(1);
  });

  it("throttles repeats of the same sound but not different sounds", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    loadAll();
    // loadAll() decoded "key" inside the confirm window, so it just clicked.
    howl("key").play.mockClear();
    now += 100;

    sfx.playSfx("key");
    now += 20;
    sfx.playSfx("key");
    sfx.playSfx("drop");
    expect(howl("key").play).toHaveBeenCalledTimes(1);
    expect(howl("drop").play).toHaveBeenCalledTimes(1);

    now += 60;
    sfx.playSfx("key");
    expect(howl("key").play).toHaveBeenCalledTimes(2);
  });

  it("is silent while the tab is hidden", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    loadAll();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    sfx.playSfx("drop");
    expect(howl("drop").play).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    sfx.playSfx("drop");
    expect(howl("drop").play).toHaveBeenCalledTimes(1);
  });

  it("never throws — not from howler, not from storage", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    loadAll();
    howl("error").play.mockImplementation(() => {
      throw new Error("decoder exploded");
    });
    expect(() => sfx.playSfx("error")).not.toThrow();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => sfx.playSfx("key")).not.toThrow();
    expect(() => sfx.sfxEnabled()).not.toThrow();
  });

  it("still toggles for the visit when storage refuses writes", async () => {
    const sfx = await fresh();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => sfx.setSfxEnabled(true)).not.toThrow();
    expect(sfx.sfxEnabled()).toBe(true);
  });

  it("persists the choice under pulsar_sfx_v1", async () => {
    let sfx = await fresh();
    sfx.setSfxEnabled(true);
    expect(localStorage.getItem("pulsar_sfx_v1")).toBe("1");
    sfx = await fresh();
    expect(sfx.sfxEnabled()).toBe(true);
    sfx.setSfxEnabled(false);
    expect(localStorage.getItem("pulsar_sfx_v1")).toBe("0");
    expect((await fresh()).sfxEnabled()).toBe(false);
  });

  it("for a returning listener, loads on the first sound (dropping it) and plays from then on", async () => {
    localStorage.setItem("pulsar_sfx_v1", "1");
    const sfx = await fresh();
    await settle();
    expect(h.imports).toBe(0); // nothing at page load

    sfx.playSfx("drop");
    await settle();
    expect(h.imports).toBe(1);
    loadAll();
    expect(howl("drop").play).not.toHaveBeenCalled();
    // No enable click happened, so no confirmation click either.
    expect(howl("key").play).not.toHaveBeenCalled();

    sfx.playSfx("drop");
    expect(howl("drop").play).toHaveBeenCalledTimes(1);
  });

  it("turning off unloads every sound and closes the AudioContext without opening another", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    loadAll();
    const loaded = [...h.howls];
    sfx.setSfxEnabled(false);

    loaded.forEach((x) => expect(x.unload).toHaveBeenCalled());
    expect(h.contexts).toHaveLength(1);
    expect(h.contexts[0].close).toHaveBeenCalled();

    sfx.playSfx("key");
    await settle();
    expect(h.howls).toHaveLength(4);

    // On again: a fresh context, handed to Howler in place of the closed one.
    sfx.setSfxEnabled(true);
    await settle();
    expect(h.contexts).toHaveLength(2);
    expect(h.Howler?.ctx).toBe(h.contexts[1]);
    expect(h.howls).toHaveLength(8);
  });

  it("discards a load that was still in flight when sounds went off", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    sfx.setSfxEnabled(false);
    await settle();
    expect(h.howls).toHaveLength(0);
    // The context opened in the click is already closed again.
    expect(h.contexts).toHaveLength(1);
    expect(h.contexts[0].close).toHaveBeenCalled();
  });

  it("can still load later if another tab turned sounds off mid-download", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    localStorage.setItem("pulsar_sfx_v1", "0"); // another tab, before the chunk lands
    await settle();
    expect(h.howls).toHaveLength(0);

    localStorage.setItem("pulsar_sfx_v1", "1"); // and back on
    sfx.playSfx("key");
    await settle();
    expect(h.howls).toHaveLength(4);
  });

  it("falls back to mp3 when the webm fails to decode", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    const webm = howl("drop");
    webm.opts.onloaderror?.();
    expect(webm.unload).toHaveBeenCalled();
    const mp3 = howl("drop");
    expect(mp3).not.toBe(webm);
    expect(mp3.opts.src).toEqual(["/sfx/drop.mp3"]);
    // ...and gives up quietly if that fails too.
    mp3.opts.onloaderror?.();
    expect(howl("drop")).toBe(mp3);
  });

  it("never plays a Howl that howler has moved onto an HTML5 <audio> element", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    loadAll();
    howl("drop")._webAudio = false;
    sfx.playSfx("drop");
    expect(howl("drop").play).not.toHaveBeenCalled();
  });

  it("plays through a prompt resume but drops a sound whose resume comes late", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    loadAll();
    const ctx = h.contexts[0];
    howl("key").play.mockClear();
    now += 100;

    ctx.state = "suspended";
    sfx.playSfx("key");
    expect(ctx.resume).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(howl("key").play).toHaveBeenCalledTimes(1);

    let resolve!: () => void;
    ctx.state = "suspended";
    ctx.resume.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
    now += 100;
    sfx.playSfx("key");
    now += 2000; // e.g. iOS waiting for the next tap
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(howl("key").play).toHaveBeenCalledTimes(1);
  });

  it("keeps hooks in sync within a tab and across tabs", async () => {
    const sfx = await fresh();
    const a = renderHook(() => sfx.useSfxEnabled());
    const b = renderHook(() => sfx.useSfxEnabled());
    act(() => a.result.current[1](true));
    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(true);

    // Another tab turns it off.
    act(() => {
      localStorage.setItem("pulsar_sfx_v1", "0");
      window.dispatchEvent(new StorageEvent("storage", { key: "pulsar_sfx_v1", newValue: "0" }));
    });
    expect(a.result.current[0]).toBe(false);
    expect(b.result.current[0]).toBe(false);
  });

  it("tears down when another tab turns sounds off", async () => {
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    localStorage.setItem("pulsar_sfx_v1", "0");
    window.dispatchEvent(new StorageEvent("storage", { key: "pulsar_sfx_v1", newValue: "0" }));
    expect(h.contexts[0].close).toHaveBeenCalled();
    h.howls.forEach((x) => expect(x.unload).toHaveBeenCalled());
  });

  it("retries the chunk on a later gesture if the first download failed", async () => {
    h.failImport = true;
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    expect(h.howls).toHaveLength(0);

    h.failImport = false;
    sfx.playSfx("key");
    await settle();
    expect(h.howls).toHaveLength(4);
    // The context opened in the click is reused, not replaced.
    expect(h.contexts).toHaveLength(1);
  });

  it("never fetches howler where there is no Web Audio, since nothing could play", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const sfx = await fresh();
    sfx.setSfxEnabled(true);
    await settle();
    expect(h.imports).toBe(0);
    expect(sfx.sfxEnabled()).toBe(true);
  });

  it("after a reload, waits for the visitor's first interaction before opening a context", async () => {
    localStorage.setItem("pulsar_sfx_v1", "1");
    const activation = { hasBeenActive: false, isActive: false };
    Object.defineProperty(navigator, "userActivation", { configurable: true, value: activation });
    try {
      const sfx = await fresh();
      sfx.playSfx("success"); // e.g. an export card shown on mount after a redirect
      await settle();
      expect(h.imports).toBe(0);
      expect(h.contexts).toHaveLength(0);

      activation.hasBeenActive = true;
      sfx.playSfx("success");
      await settle();
      expect(h.contexts).toHaveLength(1);
      expect(h.howls).toHaveLength(4);
    } finally {
      delete (navigator as { userActivation?: unknown }).userActivation;
    }
  });
});

describe("lib/sfx under WebKit's gesture rule", () => {
  beforeEach(() => {
    h.webkit = true;
  });

  it("opens and starts the context inside the toggle's click, then hands it to Howler", async () => {
    const sfx = await fresh();
    gesture(() => sfx.setSfxEnabled(true));
    // Synchronously, before the chunk has even been requested back.
    expect(h.contexts).toHaveLength(1);
    const ctx = h.contexts[0];
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.state).toBe("running");
    expect(ctx.gains[0].connect).toHaveBeenCalledWith(ctx.destination);

    await settle();
    expect(h.Howler?.ctx).toBe(ctx);
    expect(h.Howler?.masterGain).toBe(ctx.gains[0]);
    expect(h.Howler).toMatchObject({ autoUnlock: false, autoSuspend: false });
    expect(h.contexts).toHaveLength(1); // Howler never opened its own

    // The confirmation decodes later, outside the click, and still sounds.
    howl("key").loaded();
    expect(howl("key").play).toHaveBeenCalledTimes(1);
  });

  it("plays a drop that lands long after the click, and an export chime with no click at all", async () => {
    const sfx = await fresh();
    gesture(() => sfx.setSfxEnabled(true));
    await settle();
    loadAll();
    now += 5000;
    sfx.playSfx("drop"); // a WAAPI finish event, not a gesture
    sfx.playSfx("success"); // a React effect after an async export
    await flush();
    expect(howl("drop").play).toHaveBeenCalledTimes(1);
    expect(howl("success").play).toHaveBeenCalledTimes(1);
  });

  it("after a reload, the next click starts the context, and a sound WebKit held stays dropped", async () => {
    localStorage.setItem("pulsar_sfx_v1", "1");
    const sfx = await fresh();
    sfx.playSfx("drop"); // a landing, outside any gesture: starts the load, is dropped
    await settle();
    loadAll();
    const ctx = h.contexts[0];
    expect(h.Howler?.ctx).toBe(ctx);
    expect(ctx.state).toBe("suspended"); // opened outside a gesture

    now += 100;
    sfx.playSfx("drop"); // still no click since the reload: WebKit holds the resume
    await flush();
    expect(howl("drop").play).not.toHaveBeenCalled();

    now += 3000;
    tap(); // the click that adds the next record...
    expect(ctx.state).toBe("running");
    await flush();
    expect(howl("drop").play).not.toHaveBeenCalled(); // ...doesn't release the stale drop

    now += 620; // ...and its own drop lands
    sfx.playSfx("drop");
    expect(howl("drop").play).toHaveBeenCalledTimes(1);
  });

  it("after a reload, a transport key's own click opens the context already running", async () => {
    localStorage.setItem("pulsar_sfx_v1", "1");
    const sfx = await fresh();
    gesture(() => sfx.playSfx("key")); // NowPlayingBar's onClick: starts the load, is dropped
    expect(h.contexts).toHaveLength(1);
    expect(h.contexts[0].state).toBe("running");
    await settle();
    loadAll();
    expect(howl("key").play).not.toHaveBeenCalled(); // nothing was toggled, so no confirmation

    now += 3000;
    sfx.playSfx("drop"); // a landing, outside any gesture
    expect(howl("drop").play).toHaveBeenCalledTimes(1);
  });

  it("counts Enter on the new-crate form as the gesture", async () => {
    localStorage.setItem("pulsar_sfx_v1", "1");
    const sfx = await fresh();
    sfx.playSfx("drop");
    await settle();
    gesture(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(h.contexts[0].state).toBe("running");
  });

  it("goes idle after 30 s with neither a sound nor a click, and the next click wakes it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const sfx = await fresh();
    gesture(() => sfx.setSfxEnabled(true));
    await settle();
    loadAll(); // the confirmation plays
    const ctx = h.contexts[0];

    vi.advanceTimersByTime(29_000);
    tap();
    vi.advanceTimersByTime(29_000);
    now += 60_000;
    sfx.playSfx("drop");
    vi.advanceTimersByTime(29_000);
    expect(ctx.suspend).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe("suspended");

    tap();
    expect(ctx.state).toBe("running");
  });

  it("stops listening for clicks and cancels the idle timer when turned off", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const sfx = await fresh();
    gesture(() => sfx.setSfxEnabled(true));
    await settle();
    const ctx = h.contexts[0];
    sfx.setSfxEnabled(false);
    const resumes = ctx.resume.mock.calls.length;

    tap();
    vi.advanceTimersByTime(60_000);
    expect(ctx.resume).toHaveBeenCalledTimes(resumes);
    expect(ctx.suspend).not.toHaveBeenCalled();
    expect(h.contexts).toHaveLength(1);
  });
});

describe("flyToCrate plays the drop", () => {
  const playSfx = vi.fn();
  const realMatchMedia = window.matchMedia;

  async function fly() {
    vi.resetModules();
    vi.doMock("@/lib/sfx", () => ({ playSfx }));
    return (await import("@/lib/flyToCrate")).flyToCrate;
  }

  beforeEach(() => {
    playSfx.mockClear();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    vi.doUnmock("@/lib/sfx");
  });

  it("immediately under reduced motion, with nothing animated", async () => {
    window.matchMedia = ((q: string) => ({ ...realMatchMedia(q), matches: q.includes("reduce") })) as typeof window.matchMedia;
    const flyToCrate = await fly();
    const src = document.body.appendChild(document.createElement("div"));
    flyToCrate(src);
    expect(playSfx).toHaveBeenCalledWith("drop");
    expect(document.body.children).toHaveLength(1); // no ghost
  });

  it("immediately when there is no crate on screen to fly to", async () => {
    const flyToCrate = await fly();
    flyToCrate(document.body.appendChild(document.createElement("div")));
    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it("on arrival when it flies, and not at all if the arrival is stale", async () => {
    const flyToCrate = await fly();
    const rect = { left: 0, top: 0, width: 40, height: 40 } as DOMRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
    const finishers: Array<() => void> = [];
    const animate = vi.fn(() => ({
      addEventListener: (type: string, fn: () => void) => type === "finish" && finishers.push(fn),
    }));
    (Element.prototype as unknown as { animate: unknown }).animate = animate;

    const target = document.body.appendChild(document.createElement("button"));
    target.setAttribute("data-crate-target", "");
    const src = document.body.appendChild(document.createElement("div"));

    flyToCrate(src);
    expect(playSfx).not.toHaveBeenCalled(); // still in the air
    now += 620;
    finishers.forEach((f) => f());
    expect(playSfx).toHaveBeenCalledTimes(1);
    expect(playSfx).toHaveBeenCalledWith("drop");

    // Hidden mid-flight: the finish only fires seconds later.
    playSfx.mockClear();
    finishers.length = 0;
    flyToCrate(src);
    now += 5000;
    finishers.forEach((f) => f());
    expect(playSfx).not.toHaveBeenCalled();

    delete (Element.prototype as unknown as { animate?: unknown }).animate;
  });
});
