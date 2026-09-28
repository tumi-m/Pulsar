import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useEffect } from "react";
import { PlayerProvider, usePlayer } from "@/components/player/PlayerProvider";
import type { Release } from "@/lib/types";

/**
 * Behavioural cover for the retry path — the "it says tap again and when I tap
 * it does nothing" failure.
 *
 * unlockAudio() primes the element with a silent clip so iOS will allow later
 * programmatic play() calls. It assigned that clip UNCONDITIONALLY, and three
 * paths called it with a real preview already loaded: play()'s pre-check (so
 * the Retry button), playDirect's rejection handler, and the document-wide tap
 * listener. Each one replaced the preview it was meant to rescue and then
 * "resumed" silence.
 *
 * jsdom has no media pipeline, so play() is stubbed to behave like a browser
 * that rejects the first programmatic call (Safari's autoplay policy) and
 * accepts later ones.
 */

const PREVIEW = "https://audio.example/preview.m4a";

const release = {
  id: "r1",
  artist: "Burial",
  title: "Archangel",
  type: "single",
  artwork_url: "",
  release_date: "2007-11-05",
  genre: null,
  tags: [],
  mood: null,
  spotify: null,
  apple_music: null,
  tidal: null,
  soundcloud: null,
  youtube_music: null,
  boomplay: null,
  created_at: "2026-01-01T00:00:00Z",
  curator_note: null,
} as unknown as Release;

let audio: HTMLAudioElement | null = null;
let plays = 0;
const RealAudio = window.Audio;

beforeEach(() => {
  plays = 0;
  audio = null;
  // Capture the provider's element as it's constructed.
  (window as unknown as { Audio: unknown }).Audio = function () {
    audio = document.createElement("audio");
    return audio;
  };
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { value: true, configurable: true });
    this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    plays += 1;
    if (plays === 1) {
      return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
    }
    Object.defineProperty(this, "paused", { value: false, configurable: true });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
});

afterEach(() => {
  (window as unknown as { Audio: unknown }).Audio = RealAudio;
  vi.restoreAllMocks();
});

type Player = ReturnType<typeof usePlayer>;
function Capture({ into }: { into: { current: Player | null } }) {
  const p = usePlayer();
  useEffect(() => {
    into.current = p;
  });
  return null;
}

async function mount() {
  const ref: { current: Player | null } = { current: null };
  render(
    <PlayerProvider>
      <Capture into={ref} />
    </PlayerProvider>
  );
  await act(async () => {});
  return ref;
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("retrying a blocked preview keeps the preview", () => {
  it("playDirect's fallback does not replace the track with the silent clip", async () => {
    const player = await mount();
    await act(async () => player.current!.playDirect(release, PREVIEW));
    await flush();
    expect(audio!.getAttribute("src")).toBe(PREVIEW);
  });

  it("a tap anywhere on the page does not silence a loaded track", async () => {
    const player = await mount();
    await act(async () => player.current!.playDirect(release, PREVIEW));
    await flush();
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await flush();
    expect(audio!.getAttribute("src")).toBe(PREVIEW);
  });

  it("the Retry button re-plays the same preview and clears the error", async () => {
    // Every programmatic play fails until a real gesture: reject the first two.
    let n = 0;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      n += 1;
      if (n <= 2) return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
      Object.defineProperty(this, "paused", { value: false, configurable: true });
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    const player = await mount();
    await act(async () => player.current!.playDirect(release, PREVIEW));
    await flush();
    expect(player.current!.error).toBeTruthy();

    // Retry — what NowPlayingBar's button calls.
    await act(async () => player.current!.play(release));
    await flush();
    expect(audio!.getAttribute("src")).toBe(PREVIEW);
    expect(player.current!.error).toBeNull();
    expect(player.current!.playing).toBe(true);
  });
});

describe("stop() cancels a play still in flight", () => {
  it("a preview lookup that lands after Close does not start audio", async () => {
    let resolveFetch: (v: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((r) => (resolveFetch = r))
    );
    const player = await mount();
    await act(async () => void player.current!.play({ ...release, id: "r2" }));
    // The user closes the player while the spinner is up…
    await act(async () => player.current!.stop());
    // …and the lookup arrives afterwards.
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ previewUrl: PREVIEW }), { status: 200 }));
    });
    await flush();
    expect(player.current!.current).toBeNull();
    expect(audio!.getAttribute("src")).not.toBe(PREVIEW);
  });
});
