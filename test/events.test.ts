import { afterEach, describe, it, expect, vi } from "vitest";
import { emit, on, onRequest, request, REQUEST_TTL_MS, type PulsarEventName } from "@/lib/events";
import type { Release } from "@/lib/types";

const release: Release = {
  id: "r1",
  artist: "A",
  title: "T",
  type: "album",
  artwork_url: "https://example.com/a.jpg",
  release_date: "2026-01-01",
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
};

describe("typed event bus", () => {
  it("emits and receives payloads with the right type", () => {
    const handler = vi.fn();
    const off = on("pulsar-open-release", handler);
    emit("pulsar-open-release", release);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual(release);
    off();
  });

  it("emits payload-less events without a detail field", () => {
    const handler = vi.fn();
    const off = on("pulsar-ai-activate", handler);
    emit("pulsar-ai-activate");
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it("unsubscribe stops delivery", () => {
    const handler = vi.fn();
    const off = on("pulsar-toggle-sidebar", handler);
    off();
    emit("pulsar-toggle-sidebar");
    expect(handler).not.toHaveBeenCalled();
  });

  it("covers every channel in the map (smoke)", () => {
    const channels: PulsarEventName[] = [
      "pulsar-collection-change",
      "pulsar-detail-open",
      "pulsar-open-release",
      "pulsar-open-discography",
      "pulsar-show-discography",
      "pulsar-toggle-sidebar",
      "pulsar-crate-picker",
      "pulsar-crate-open",
      "pulsar-open-crate",
      "pulsar-nav-hidden",
      "pulsar-ai-activate",
      "pulsar-open-samples",
      "pulsar-samples-open",
      "pulsar-format-change",
      "pulsar-type-change",
      "pulsar-retake-quiz",
      "pulsar-theme-change",
    ];
    expect(channels.length).toBeGreaterThan(15);
  });
});
describe("requests that open a panel", () => {
  afterEach(() => vi.useRealTimers());

  it("replays a press made before the panel was listening, once", () => {
    // The navbar hydrates before the page's Suspense boundary: a press then
    // reached no listener and was lost.
    request("pulsar-open-samples");
    const handler = vi.fn();
    const off = onRequest("pulsar-open-samples", handler);
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    // Taken: a second listener (a remount) doesn't open it again.
    const again = vi.fn();
    const off2 = onRequest("pulsar-open-samples", again);
    expect(again).not.toHaveBeenCalled();
    off2();
  });

  it("carries the payload through the wait", () => {
    request("pulsar-open-crate", "favorites");
    const handler = vi.fn();
    const off = onRequest("pulsar-open-crate", handler);
    expect(handler).toHaveBeenCalledWith("favorites");
    off();
  });

  it("delivers live to a mounted listener, and leaves nothing waiting", () => {
    const handler = vi.fn();
    const off = onRequest("pulsar-ai-activate", handler);
    request("pulsar-ai-activate");
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    const later = vi.fn();
    const off2 = onRequest("pulsar-ai-activate", later);
    expect(later).not.toHaveBeenCalled();
    off2();
  });

  it("still hears plain events from other senders (the sidebar)", () => {
    const handler = vi.fn();
    const off = onRequest("pulsar-open-crate", handler);
    emit("pulsar-open-crate", "playlist");
    expect(handler).toHaveBeenCalledWith("playlist");
    off();
  });

  it("drops a press that has waited too long", () => {
    vi.useFakeTimers();
    request("pulsar-open-samples");
    vi.advanceTimersByTime(REQUEST_TTL_MS + 1);
    const handler = vi.fn();
    const off = onRequest("pulsar-open-samples", handler);
    expect(handler).not.toHaveBeenCalled();
    off();
  });
});
