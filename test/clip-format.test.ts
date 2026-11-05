import { describe, it, expect, vi } from "vitest";

/**
 * The clip recorder's decisions, minus the browser: how long and how fast a
 * take is allowed to be, what size it's encoded at, what it's called, and —
 * the one that decides whether a listener gets a file at all — which
 * container and codecs it picks from what this browser says it can encode.
 *
 * Mediabunny is mocked: the planner takes its capability checks as an
 * argument, and the module's static import must not pull the real library
 * into jsdom.
 */
vi.mock("mediabunny", () => ({
  BufferTarget: class {},
  Mp4OutputFormat: class {},
  WebMOutputFormat: class {},
  Output: class {},
  Quality: class {},
  MediaStreamAudioTrackSource: class {},
  MediaStreamVideoTrackSource: class {},
  canEncodeVideo: vi.fn(async () => false),
  canEncodeAudio: vi.fn(async () => false),
}));

import {
  CLIP_DEFAULT_FPS,
  CLIP_DEFAULT_SECONDS,
  CLIP_MAX_SECONDS,
  clampClipOptions,
  clipDimensions,
  clipFileName,
  planClipFormat,
  type EncodeCaps,
} from "@/lib/clipRecorder";

/** Capability checks that answer from a list, and record what was asked. */
function caps(video: string[], audio: string[] = []) {
  const canEncodeVideo = vi.fn(async (codec: string) => video.includes(codec));
  const canEncodeAudio = vi.fn(async (codec: string) => audio.includes(codec));
  return {
    caps: { canEncodeVideo, canEncodeAudio } as unknown as EncodeCaps,
    canEncodeVideo,
    canEncodeAudio,
  };
}

const SPEC = { width: 1280, height: 720, fps: 30 };
const STEREO_48K = { sampleRate: 48000, numberOfChannels: 2 };

describe("clampClipOptions", () => {
  it("defaults to an 8 second, 30 fps take", () => {
    expect(clampClipOptions()).toEqual({ seconds: CLIP_DEFAULT_SECONDS, fps: CLIP_DEFAULT_FPS });
    expect(CLIP_DEFAULT_SECONDS).toBe(8);
    expect(CLIP_DEFAULT_FPS).toBe(30);
  });

  it("caps the length at 15 seconds and floors it at 1", () => {
    expect(clampClipOptions({ seconds: 60 }).seconds).toBe(CLIP_MAX_SECONDS);
    expect(CLIP_MAX_SECONDS).toBe(15);
    expect(clampClipOptions({ seconds: 0 }).seconds).toBe(1);
    expect(clampClipOptions({ seconds: -5 }).seconds).toBe(1);
    expect(clampClipOptions({ seconds: 12.5 }).seconds).toBe(12.5);
  });

  it("treats junk as 'use the default' rather than as zero", () => {
    expect(clampClipOptions({ seconds: Number.NaN, fps: Number.POSITIVE_INFINITY })).toEqual({
      seconds: 8,
      fps: 30,
    });
  });

  it("rounds the frame rate and keeps it in a sane range", () => {
    expect(clampClipOptions({ fps: 29.97 }).fps).toBe(30);
    expect(clampClipOptions({ fps: 240 }).fps).toBe(60);
    expect(clampClipOptions({ fps: 1 }).fps).toBe(12);
  });
});

describe("clipDimensions", () => {
  it("makes both sides even, which H.264 requires", () => {
    const d = clipDimensions(977, 593);
    expect(d.width % 2).toBe(0);
    expect(d.height % 2).toBe(0);
    expect(Math.abs(d.width - 977)).toBeLessThanOrEqual(1);
    expect(Math.abs(d.height - 593)).toBeLessThanOrEqual(1);
  });

  it("scales a hi-DPR canvas down so the long edge fits 1280, keeping the aspect", () => {
    const d = clipDimensions(1925, 595);
    expect(d.width).toBe(1280);
    expect(d.height % 2).toBe(0);
    expect(d.width / d.height).toBeCloseTo(1925 / 595, 1);
    const portrait = clipDimensions(720, 2400);
    expect(portrait.height).toBe(1280);
  });

  it("leaves a small canvas alone and never returns zero", () => {
    expect(clipDimensions(640, 360)).toEqual({ width: 640, height: 360 });
    expect(clipDimensions(0, 0)).toEqual({ width: 2, height: 2 });
  });
});

describe("clipFileName", () => {
  it("is pulsar-<release>-clip.<ext>", () => {
    expect(clipFileName("Selected Ambient Works 85–92", "mp4")).toBe("pulsar-selected-ambient-works-85-92-clip.mp4");
  });

  it("strips accents and punctuation so every share target accepts it", () => {
    expect(clipFileName("Débora's Café: Vol. II!", ".webm")).toBe("pulsar-deboras-cafe-vol-ii-clip.webm");
  });

  it("falls back to 'release' when the title has nothing usable", () => {
    expect(clipFileName("", "mp4")).toBe("pulsar-release-clip.mp4");
    expect(clipFileName("☆☆☆", "mp4")).toBe("pulsar-release-clip.mp4");
    expect(clipFileName(null, "mp4")).toBe("pulsar-release-clip.mp4");
  });

  it("keeps long titles short", () => {
    const name = clipFileName("a".repeat(200), "mp4");
    expect(name.length).toBeLessThanOrEqual("pulsar--clip.mp4".length + 48);
  });
});

describe("planClipFormat", () => {
  it("prefers MP4 with H.264 + AAC when the browser can do both", async () => {
    const { caps: c } = caps(["avc", "vp9", "vp8"], ["aac", "opus"]);
    expect(await planClipFormat(c, { ...SPEC, audio: STEREO_48K })).toEqual({
      container: "mp4",
      videoCodec: "avc",
      audioCodec: "aac",
      audioSampleRate: null,
      audioDropped: false,
    });
  });

  it("checks the exact config the capture source will use", async () => {
    const { caps: c, canEncodeVideo } = caps(["avc"]);
    await planClipFormat(c, { width: 640, height: 360, fps: 24, audio: null });
    expect(canEncodeVideo).toHaveBeenCalledWith(
      "avc",
      expect.objectContaining({ width: 640, height: 360, frameRate: 24, latencyMode: "realtime" })
    );
  });

  it("doesn't ask about WebM or audio for a silent clip MP4 can already carry", async () => {
    const { caps: c, canEncodeVideo, canEncodeAudio } = caps(["avc", "vp9"]);
    const plan = await planClipFormat(c, { ...SPEC, audio: null });
    expect(plan).toMatchObject({ container: "mp4", videoCodec: "avc", audioCodec: null, audioDropped: false });
    expect(canEncodeVideo).toHaveBeenCalledTimes(1);
    expect(canEncodeAudio).not.toHaveBeenCalled();
  });

  it("falls back to WebM VP9, then VP8, without H.264 (e.g. Chromium builds)", async () => {
    expect(await planClipFormat(caps(["vp9", "vp8"]).caps, { ...SPEC, audio: null })).toMatchObject({
      container: "webm",
      videoCodec: "vp9",
    });
    expect(await planClipFormat(caps(["vp8"]).caps, { ...SPEC, audio: null })).toMatchObject({
      container: "webm",
      videoCodec: "vp8",
    });
  });

  it("keeps the sound by moving to WebM/Opus when MP4 can't take AAC (Chrome on Linux)", async () => {
    const plan = await planClipFormat(caps(["avc", "vp9"], ["opus"]).caps, { ...SPEC, audio: STEREO_48K });
    expect(plan).toEqual({
      container: "webm",
      videoCodec: "vp9",
      audioCodec: "opus",
      audioSampleRate: null,
      audioDropped: false,
    });
  });

  it("drops to a silent MP4 — and says so — when no container can carry the sound", async () => {
    const plan = await planClipFormat(caps(["avc"], []).caps, { ...SPEC, audio: STEREO_48K });
    expect(plan).toMatchObject({ container: "mp4", videoCodec: "avc", audioCodec: null, audioDropped: true });
  });

  it("drops to silent WebM when only WebM video works and neither audio codec does", async () => {
    const plan = await planClipFormat(caps(["vp8"], ["aac"]).caps, { ...SPEC, audio: STEREO_48K });
    expect(plan).toMatchObject({ container: "webm", videoCodec: "vp8", audioCodec: null, audioDropped: true });
  });

  it("resamples only when the encoder needs it", async () => {
    // 44.1 kHz is a valid AAC rate — leave it alone.
    const aac = await planClipFormat(caps(["avc"], ["aac"]).caps, {
      ...SPEC,
      audio: { sampleRate: 44100, numberOfChannels: 2 },
    });
    expect(aac).toMatchObject({ audioCodec: "aac", audioSampleRate: null });
    // An odd device rate goes to 48 kHz for AAC…
    const odd = await planClipFormat(caps(["avc"], ["aac"]).caps, {
      ...SPEC,
      audio: { sampleRate: 96000, numberOfChannels: 2 },
    });
    expect(odd).toMatchObject({ audioCodec: "aac", audioSampleRate: 48000 });
    // …and Opus always gets 48 kHz.
    const { caps: c, canEncodeAudio } = caps(["vp9"], ["opus"]);
    const opus = await planClipFormat(c, { ...SPEC, audio: { sampleRate: 44100, numberOfChannels: 2 } });
    expect(opus).toMatchObject({ audioCodec: "opus", audioSampleRate: 48000 });
    expect(canEncodeAudio).toHaveBeenCalledWith("opus", expect.objectContaining({ sampleRate: 48000 }));
  });

  it("returns null when nothing is encodable, and treats a throwing check as 'no'", async () => {
    expect(await planClipFormat(caps([]).caps, { ...SPEC, audio: STEREO_48K })).toBeNull();
    const throwing = {
      canEncodeVideo: vi.fn(async () => {
        throw new Error("VideoEncoder.isConfigSupported blew up");
      }),
      canEncodeAudio: vi.fn(async () => false),
    } as unknown as EncodeCaps;
    expect(await planClipFormat(throwing, { ...SPEC, audio: null })).toBeNull();
  });
});
