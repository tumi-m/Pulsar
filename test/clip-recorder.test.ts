import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

/**
 * recordCanvasClip's orchestration with Mediabunny mocked out: that a take
 * runs for its length and reports progress, that cancelling or an encoder
 * failure cancels the output and stops the capture, that it refuses clearly
 * when the browser can't encode, and that it never stops the caller's audio
 * track (the player's analyser tap belongs to the Visualizer).
 */

interface FakeOutput {
  state: string;
  format: { options?: unknown; mimeType: string };
  target: { buffer: ArrayBuffer | null };
  start: Mock;
  finalize: Mock;
  cancel: Mock;
  addVideoTrack: Mock;
  addAudioTrack: Mock;
}
interface FakeSource {
  config: {
    codec: string;
    sizeChangeBehavior?: string;
    transform?: { width?: number; height?: number; sampleRate?: number };
  };
  options?: unknown;
  fail: (e: unknown) => void;
}

const mb = vi.hoisted(() => ({
  video: new Set<string>(),
  audio: new Set<string>(),
  outputs: [] as FakeOutput[],
  videoSources: [] as FakeSource[],
  audioSources: [] as FakeSource[],
  finalBytes: 2048,
}));

vi.mock("mediabunny", () => {
  class Quality {
    constructor(public level: string) {}
  }
  class BufferTarget {
    buffer: ArrayBuffer | null = null;
  }
  class Mp4OutputFormat {
    fileExtension = ".mp4";
    mimeType = "video/mp4";
    constructor(public options?: unknown) {}
  }
  class WebMOutputFormat {
    fileExtension = ".webm";
    mimeType = "video/webm";
  }
  class Output {
    state = "pending";
    format: FakeOutput["format"];
    target: FakeOutput["target"];
    addVideoTrack = vi.fn();
    addAudioTrack = vi.fn();
    start = vi.fn(async () => {
      this.state = "started";
    });
    finalize = vi.fn(async () => {
      this.target.buffer = new ArrayBuffer(mb.finalBytes);
      this.state = "finalized";
    });
    cancel = vi.fn(async () => {
      this.state = "canceled";
    });
    constructor(opts: { format: FakeOutput["format"]; target: FakeOutput["target"] }) {
      this.format = opts.format;
      this.target = opts.target;
      mb.outputs.push(this);
    }
  }
  class Source {
    fail!: (e: unknown) => void;
    errorPromise = new Promise<void>((_, reject) => {
      this.fail = reject;
    });
    constructor(
      public track: unknown,
      public config: FakeSource["config"],
      public options?: unknown
    ) {}
  }
  class MediaStreamVideoTrackSource extends Source {
    constructor(track: unknown, config: FakeSource["config"], options?: unknown) {
      super(track, config, options);
      mb.videoSources.push(this);
    }
  }
  class MediaStreamAudioTrackSource extends Source {
    constructor(track: unknown, config: FakeSource["config"], options?: unknown) {
      super(track, config, options);
      mb.audioSources.push(this);
    }
  }
  return {
    Quality,
    BufferTarget,
    Mp4OutputFormat,
    WebMOutputFormat,
    Output,
    MediaStreamVideoTrackSource,
    MediaStreamAudioTrackSource,
    canEncodeVideo: vi.fn(async (codec: string) => mb.video.has(codec)),
    canEncodeAudio: vi.fn(async (codec: string) => mb.audio.has(codec)),
  };
});

import {
  recordCanvasClip,
  saveClipFile,
  takeClip,
  tapAnalyserAudio,
  type ClipProgress,
  type PreviewState,
  type TakeProgress,
} from "@/lib/clipRecorder";

function fakeCanvas(width = 1101, height = 619) {
  const track = { kind: "video", stop: vi.fn() };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const captureStream = vi.fn(() => stream);
  (canvas as unknown as { captureStream: typeof captureStream }).captureStream = captureStream;
  return { canvas, track, captureStream };
}

function fakeAudio(sampleRate = 48000) {
  return {
    kind: "audio",
    readyState: "live",
    stop: vi.fn(),
    getSettings: () => ({ sampleRate, channelCount: 2 }),
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
}

/** Let the awaited capability checks and output.start() settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("VideoEncoder", class {});
  mb.video = new Set(["avc", "vp9", "vp8"]);
  mb.audio = new Set(["aac", "opus"]);
  mb.outputs.length = 0;
  mb.videoSources.length = 0;
  mb.audioSources.length = 0;
  mb.finalBytes = 2048;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recordCanvasClip", () => {
  it("records for the requested length, reports progress, and returns an MP4", async () => {
    const { canvas, track, captureStream } = fakeCanvas();
    const progress: ClipProgress[] = [];
    const take = recordCanvasClip(canvas, { seconds: 3, onProgress: (p) => progress.push(p) });

    await settle();
    expect(captureStream).toHaveBeenCalledWith(30);
    expect(mb.outputs[0].start).toHaveBeenCalled();
    expect(mb.outputs[0].finalize).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    expect(mb.outputs[0].finalize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    const result = await take;

    expect(mb.outputs[0].finalize).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ mimeType: "video/mp4", extension: "mp4", hasAudio: false, seconds: 3 });
    expect(result.blob.size).toBe(2048);
    expect(result.blob.type).toBe("video/mp4");
    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);

    const recording = progress.filter((p) => p.phase === "recording").map((p) => p.fraction);
    expect(recording[0]).toBe(0);
    expect(recording.at(-1)).toBe(1);
    expect(recording).toEqual([...recording].sort((a, b) => a - b));
    expect(progress.at(-1)).toMatchObject({ phase: "finalizing", fraction: 1 });

    // The capture track is ours: stopped once the file exists.
    expect(track.stop).toHaveBeenCalled();
  });

  it("captures at a fixed rate into an even-sized, resize-tolerant H.264 track", async () => {
    const { canvas } = fakeCanvas(977, 593);
    const take = recordCanvasClip(canvas, { seconds: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    await take;
    const src = mb.videoSources[0];
    expect(src.config).toMatchObject({ codec: "avc", sizeChangeBehavior: "contain" });
    expect((src.config.transform?.width ?? 1) % 2).toBe(0);
    expect((src.config.transform?.height ?? 1) % 2).toBe(0);
    expect(src.options).toEqual({ frameRate: 30 });
    expect(mb.outputs[0].format.options).toEqual({ fastStart: "in-memory" });
  });

  it("muxes the offered audio as AAC, and leaves the caller's track running", async () => {
    const { canvas } = fakeCanvas();
    const audio = fakeAudio(44100);
    const take = recordCanvasClip(canvas, { seconds: 1, audio });
    await vi.advanceTimersByTimeAsync(1200);
    const result = await take;
    expect(result.hasAudio).toBe(true);
    expect(mb.audioSources[0].config).toMatchObject({ codec: "aac" });
    expect(mb.audioSources[0].config.transform).toBeUndefined();
    expect(mb.outputs[0].addAudioTrack).toHaveBeenCalled();
    expect(audio.stop).not.toHaveBeenCalled();
  });

  it("switches to WebM/Opus (resampled to 48 kHz) when AAC can't be encoded", async () => {
    mb.audio = new Set(["opus"]);
    const { canvas } = fakeCanvas();
    const take = recordCanvasClip(canvas, { seconds: 1, audio: fakeAudio(44100) });
    await vi.advanceTimersByTimeAsync(1200);
    const result = await take;
    expect(result).toMatchObject({ mimeType: "video/webm", extension: "webm", hasAudio: true, audioDropped: false });
    expect(mb.videoSources[0].config.codec).toBe("vp9");
    expect(mb.audioSources[0].config).toMatchObject({ codec: "opus", transform: { sampleRate: 48000 } });
  });

  it("says on every tick whether an audio track is really being muxed", async () => {
    const { canvas } = fakeCanvas();
    const withSound: ClipProgress[] = [];
    let take = recordCanvasClip(canvas, { seconds: 1, audio: fakeAudio(), onProgress: (p) => withSound.push(p) });
    await vi.advanceTimersByTimeAsync(1200);
    await take;
    expect(withSound.length).toBeGreaterThan(2);
    expect(withSound.every((p) => p.hasAudio && !p.audioDropped)).toBe(true);

    // Offered sound that no encoder can take: dropped before the first tick.
    mb.audio = new Set();
    const dropped: ClipProgress[] = [];
    take = recordCanvasClip(fakeCanvas().canvas, { seconds: 1, audio: fakeAudio(), onProgress: (p) => dropped.push(p) });
    await vi.advanceTimersByTimeAsync(1200);
    await take;
    expect(dropped[0]).toMatchObject({ phase: "recording", hasAudio: false, audioDropped: true });
    expect(dropped.every((p) => !p.hasAudio && p.audioDropped)).toBe(true);
  });

  it("ignores an audio track that has already ended", async () => {
    const { canvas } = fakeCanvas();
    const ended = { ...fakeAudio(), readyState: "ended" } as unknown as MediaStreamTrack;
    const take = recordCanvasClip(canvas, { seconds: 1, audio: ended });
    await vi.advanceTimersByTimeAsync(1200);
    expect((await take).hasAudio).toBe(false);
    expect(mb.audioSources).toHaveLength(0);
  });

  it("cancels the output and stops the capture when aborted mid-take", async () => {
    const { canvas, track } = fakeCanvas();
    const ctrl = new AbortController();
    const take = recordCanvasClip(canvas, { seconds: 8, signal: ctrl.signal });
    const outcome = take.catch((e) => e);
    await vi.advanceTimersByTimeAsync(2000);
    ctrl.abort();
    const err = await outcome;
    expect(err).toMatchObject({ name: "ClipRecorderError", code: "aborted" });
    expect(mb.outputs[0].cancel).toHaveBeenCalled();
    expect(mb.outputs[0].finalize).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("does nothing at all for an already-aborted signal", async () => {
    const { canvas, captureStream } = fakeCanvas();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(recordCanvasClip(canvas, { signal: ctrl.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(captureStream).not.toHaveBeenCalled();
    expect(mb.outputs).toHaveLength(0);
  });

  it("turns an encoder failure into a 'failed' error instead of recording forever", async () => {
    const { canvas, track } = fakeCanvas();
    const outcome = recordCanvasClip(canvas, { seconds: 8 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    mb.videoSources[0].fail(new Error("EncodingError: encoder crashed"));
    const err = await outcome;
    expect(err).toMatchObject({ name: "ClipRecorderError", code: "failed" });
    expect(err.message).toMatch(/encoder crashed/);
    expect(mb.outputs[0].cancel).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it("reports an empty output as a failure, not as a 0-byte file", async () => {
    mb.finalBytes = 0;
    const { canvas } = fakeCanvas();
    const outcome = recordCanvasClip(canvas, { seconds: 1 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1200);
    expect(await outcome).toMatchObject({ code: "failed" });
  });

  it("refuses clearly without WebCodecs", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    const { canvas, captureStream } = fakeCanvas();
    const err = await recordCanvasClip(canvas).catch((e) => e);
    expect(err).toMatchObject({ name: "ClipRecorderError", code: "unsupported" });
    expect(err.message).toMatch(/WebCodecs/);
    expect(captureStream).not.toHaveBeenCalled();
  });

  it("refuses clearly when no video codec is encodable", async () => {
    mb.video = new Set();
    const { canvas, captureStream } = fakeCanvas();
    const err = await recordCanvasClip(canvas).catch((e) => e);
    expect(err).toMatchObject({ code: "unsupported" });
    expect(captureStream).not.toHaveBeenCalled();
  });

  it("refuses clearly when the canvas can't be captured", async () => {
    const canvas = document.createElement("canvas");
    const err = await recordCanvasClip(canvas).catch((e) => e);
    expect(err).toMatchObject({ code: "unsupported" });
  });
});

/** jsdom puts ontouchstart on window; take it away to look like a desktop. */
function asDesktop() {
  const had = Object.getOwnPropertyDescriptor(window, "ontouchstart");
  delete (window as { ontouchstart?: unknown }).ontouchstart;
  return () => {
    if (had) Object.defineProperty(window, "ontouchstart", had);
  };
}

/**
 * A stand-in for the player's analyser, recording what gets wired to it.
 * `signal.peak` is what its time-domain window holds: 0 is a paused preview.
 */
function fakeAnalyser(state: AudioContextState = "running", resumes = false) {
  const track = { kind: "audio", readyState: "live", stop: vi.fn(), getSettings: () => ({ sampleRate: 48000 }) };
  const dest = { stream: { getAudioTracks: () => [track] } };
  const ctx = {
    state,
    resume: vi.fn(async () => {
      if (resumes) ctx.state = "running";
    }),
    createMediaStreamDestination: vi.fn(() => dest),
  };
  const signal = { peak: 0.3 };
  const analyser = {
    context: ctx,
    fftSize: 8,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((out: Float32Array) => {
      out.fill(0);
      out[3] = -signal.peak;
    }),
  };
  return { analyser: analyser as unknown as AnalyserNode, raw: analyser, ctx, dest, track, signal };
}

/** The player as PlayerProvider reports it; mutate it mid-take to press play. */
function fakePlayer(state: Partial<PreviewState> = {}) {
  const now: PreviewState = { hasAudio: true, loading: false, playing: true, ...state };
  return { now, preview: () => ({ ...now }) };
}

describe("tapAnalyserAudio", () => {
  it("adds one branch to a recordable destination and removes only that branch", async () => {
    const { analyser, dest, track } = fakeAnalyser();
    const tap = await tapAnalyserAudio(analyser);
    expect(tap?.track).toBe(track);
    expect(analyser.connect).toHaveBeenCalledWith(dest);
    tap!.release();
    // disconnect(dest), never a bare disconnect() — that would cut the speakers.
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(analyser.disconnect).toHaveBeenCalledWith(dest);
    expect(track.stop).toHaveBeenCalled();
  });

  it("is null without an analyser (touch devices never build the graph)", async () => {
    expect(await tapAnalyserAudio(null)).toBeNull();
  });

  it("is null, and wires nothing, when the context won't run", async () => {
    const { analyser } = fakeAnalyser("suspended", false);
    const pending = tapAnalyserAudio(analyser);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBeNull();
    expect(analyser.connect).not.toHaveBeenCalled();
  });

  it("resumes a suspended context that is willing", async () => {
    const { analyser, ctx } = fakeAnalyser("suspended", true);
    const tap = await tapAnalyserAudio(analyser);
    expect(ctx.resume).toHaveBeenCalled();
    expect(tap).not.toBeNull();
  });

  it("reads the level of what flows to the track from the time-domain window only", async () => {
    const { analyser, raw, signal } = fakeAnalyser();
    const getFreq = vi.fn();
    (raw as unknown as { getByteFrequencyData: typeof getFreq }).getByteFrequencyData = getFreq;
    const tap = await tapAnalyserAudio(analyser);
    expect(tap!.level()).toBeCloseTo(0.3);
    signal.peak = 0;
    expect(tap!.level()).toBe(0);
    // The visual owns the frequency reads (and the smoothing they advance).
    expect(getFreq).not.toHaveBeenCalled();
  });

  it("reports an unknown level, not silence, where the engine can't read samples", async () => {
    const { analyser, raw } = fakeAnalyser();
    delete (raw as { getFloatTimeDomainData?: unknown }).getFloatTimeDomainData;
    expect((await tapAnalyserAudio(analyser))!.level()).toBeNull();
  });
});

describe("takeClip", () => {
  it("names the file, words the status line, and keeps the sound when tapped", async () => {
    const { canvas } = fakeCanvas();
    const { analyser, track } = fakeAnalyser();
    const progress: TakeProgress[] = [];
    const pending = takeClip({ canvas, analyser, title: "In Waves", seconds: 2, onProgress: (p) => progress.push(p) });
    await vi.advanceTimersByTimeAsync(2200);
    const take = await pending;
    expect(take.file.name).toBe("pulsar-in-waves-clip.mp4");
    expect(take.file.type).toBe("video/mp4");
    expect(take).toMatchObject({ sound: true, note: null, head: "Clip ready · MP4 · 2 KB" });
    expect(progress[0]).toMatchObject({ head: "Rec 0:00 / 0:02", sound: true, note: null });
    expect(progress.at(-1)).toMatchObject({ phase: "finalizing", head: "Encoding…" });
    // The tap is released once the file exists.
    expect(track.stop).toHaveBeenCalled();
  });

  it("says why a phone's clip is silent", async () => {
    const { canvas } = fakeCanvas();
    const pending = takeClip({ canvas, analyser: null, title: "x", seconds: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(await pending).toMatchObject({
      sound: false,
      note: "Video only: sound can't be captured on this device",
    });
  });

  it("says when the browser couldn't encode the sound it was given, from the first tick", async () => {
    mb.audio = new Set();
    const restore = asDesktop();
    try {
      const { canvas } = fakeCanvas();
      const progress: TakeProgress[] = [];
      const pending = takeClip({
        canvas,
        analyser: fakeAnalyser().analyser,
        preview: fakePlayer().preview,
        title: "x",
        seconds: 1,
        onProgress: (p) => progress.push(p),
      });
      await vi.advanceTimersByTimeAsync(1200);
      const cantEncode = "Video only: this browser can't encode the sound";
      expect(await pending).toMatchObject({ sound: false, note: cantEncode });
      // Not "Sound" for the length of the take and only corrected at the end.
      expect(progress.every((p) => p.sound === false && p.note === cantEncode)).toBe(true);
    } finally {
      restore();
    }
  });

  describe("on a desktop with the analyser tapped", () => {
    let restore: () => void;
    beforeEach(() => {
      restore = asDesktop();
    });
    afterEach(() => restore());

    it("calls a take silent, and says why, when the preview stays paused", async () => {
      const { analyser, signal } = fakeAnalyser();
      signal.peak = 0; // a paused element feeds exact zeros
      const player = fakePlayer({ playing: false });
      const progress: TakeProgress[] = [];
      const pending = takeClip({
        canvas: fakeCanvas().canvas,
        analyser,
        preview: player.preview,
        title: "x",
        seconds: 1,
        onProgress: (p) => progress.push(p),
      });
      await vi.advanceTimersByTimeAsync(1200);
      const take = await pending;
      const recording = progress.filter((p) => p.phase === "recording");
      expect(recording.every((p) => p.hasAudio && !p.sound)).toBe(true);
      expect(recording[0].note).toBe("Preview paused: press play to record sound");
      expect(take).toMatchObject({ sound: false, note: "Video only: the preview wasn't playing during the take" });
    });

    it("turns to Sound once the preview plays mid-take, and keeps it", async () => {
      const { analyser, signal } = fakeAnalyser();
      signal.peak = 0;
      const player = fakePlayer({ playing: false });
      const progress: TakeProgress[] = [];
      const pending = takeClip({
        canvas: fakeCanvas().canvas,
        analyser,
        preview: player.preview,
        title: "x",
        seconds: 2,
        onProgress: (p) => progress.push(p),
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(progress.at(-1)).toMatchObject({ sound: false, note: "Preview paused: press play to record sound" });

      player.now.playing = true;
      signal.peak = 0.4;
      await vi.advanceTimersByTimeAsync(200);
      expect(progress.at(-1)).toMatchObject({ sound: true, note: null });

      // Paused again: the clip still has its sound; the advice comes back.
      player.now.playing = false;
      signal.peak = 0;
      await vi.advanceTimersByTimeAsync(200);
      expect(progress.at(-1)).toMatchObject({ sound: true, note: "Preview paused: press play to record sound" });

      await vi.advanceTimersByTimeAsync(1400);
      expect(await pending).toMatchObject({ sound: true, note: null });
    });

    it("doesn't tap, or suggest pressing play, for a record with no preview", async () => {
      const { analyser, raw } = fakeAnalyser();
      const progress: TakeProgress[] = [];
      const pending = takeClip({
        canvas: fakeCanvas().canvas,
        analyser,
        preview: fakePlayer({ hasAudio: false, playing: false }).preview,
        title: "x",
        seconds: 1,
        onProgress: (p) => progress.push(p),
      });
      await vi.advanceTimersByTimeAsync(1200);
      const take = await pending;
      const why = "No preview for this record: the clip will be silent";
      expect(raw.connect).not.toHaveBeenCalled();
      expect(mb.audioSources).toHaveLength(0);
      expect(progress.every((p) => !p.sound && p.note === why)).toBe(true);
      expect(take).toMatchObject({ sound: false, note: why });
    });

    it("still taps while a preview is loading: it may arrive mid-take", async () => {
      const { analyser, raw } = fakeAnalyser();
      const pending = takeClip({
        canvas: fakeCanvas().canvas,
        analyser,
        preview: fakePlayer({ hasAudio: false, loading: true, playing: false }).preview,
        title: "x",
        seconds: 1,
      });
      await vi.advanceTimersByTimeAsync(1200);
      await pending;
      expect(raw.connect).toHaveBeenCalled();
    });

    it("says so when the preview played but no sound reached the clip", async () => {
      const { analyser, signal } = fakeAnalyser();
      signal.peak = 0; // e.g. a cross-origin preview the graph can only hear as zeros
      const pending = takeClip({
        canvas: fakeCanvas().canvas,
        analyser,
        preview: fakePlayer({ playing: true }).preview,
        title: "x",
        seconds: 1,
      });
      await vi.advanceTimersByTimeAsync(1200);
      expect(await pending).toMatchObject({ sound: false, note: "Video only: no sound reached the recorder" });
    });

    it("trusts the player's play state where the level can't be read", async () => {
      const { analyser, raw } = fakeAnalyser();
      delete (raw as { getFloatTimeDomainData?: unknown }).getFloatTimeDomainData;
      const pending = takeClip({
        canvas: fakeCanvas().canvas,
        analyser,
        preview: fakePlayer({ playing: true }).preview,
        title: "x",
        seconds: 1,
      });
      await vi.advanceTimersByTimeAsync(1200);
      expect(await pending).toMatchObject({ sound: true, note: null });
    });
  });

  it("offers the share sheet on touch devices only", async () => {
    vi.stubGlobal("navigator", { ...navigator, canShare: () => true });
    const touch = takeClip({ canvas: fakeCanvas().canvas, analyser: null, title: "x", seconds: 1 });
    await vi.advanceTimersByTimeAsync(1200);
    expect((await touch).canShare).toBe(true);

    const restore = asDesktop();
    try {
      const desktop = takeClip({ canvas: fakeCanvas().canvas, analyser: null, title: "x", seconds: 1 });
      await vi.advanceTimersByTimeAsync(1200);
      expect((await desktop).canShare).toBe(false);
    } finally {
      restore();
    }
  });

  it("refuses with a readable reason when the visual has no canvas", async () => {
    await expect(takeClip({ canvas: null, analyser: null, title: "x" })).rejects.toMatchObject({
      name: "ClipRecorderError",
      message: expect.stringMatching(/Nothing to record/),
    });
  });

  it("releases the tap when the take is cancelled", async () => {
    const { analyser, track } = fakeAnalyser();
    const ctrl = new AbortController();
    const outcome = takeClip({ canvas: fakeCanvas().canvas, analyser, title: "x", signal: ctrl.signal }).catch(
      (e) => e
    );
    await vi.advanceTimersByTimeAsync(1000);
    ctrl.abort();
    expect(await outcome).toMatchObject({ code: "aborted" });
    expect(track.stop).toHaveBeenCalled();
  });
});

describe("saveClipFile", () => {
  const file = new File([new Uint8Array(4)], "pulsar-x-clip.webm", { type: "video/webm" });

  function spyDownload() {
    const clicks: string[] = [];
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:clip", revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    return { clicks, click };
  }

  it("downloads under the clip's name when sharing isn't on offer", async () => {
    const { clicks, click } = spyDownload();
    await saveClipFile(file, false);
    expect(clicks).toEqual(["pulsar-x-clip.webm"]);
    click.mockRestore();
  });

  it("shares, and does nothing more, when the share sheet takes it", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, share });
    const { clicks, click } = spyDownload();
    await saveClipFile(file, true);
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [file] }));
    expect(clicks).toEqual([]);
    click.mockRestore();
  });

  it("treats closing the share sheet as a choice, not a failure", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      share: vi.fn(async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    });
    const { clicks, click } = spyDownload();
    await saveClipFile(file, true);
    expect(clicks).toEqual([]);
    click.mockRestore();
  });

  it("falls back to a download when sharing fails for any other reason", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      share: vi.fn(async () => {
        throw new DOMException("no gesture", "NotAllowedError");
      }),
    });
    const { clicks, click } = spyDownload();
    await saveClipFile(file, true);
    expect(clicks).toEqual(["pulsar-x-clip.webm"]);
    click.mockRestore();
  });
});
