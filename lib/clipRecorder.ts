import {
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from "mediabunny";

/**
 * Save a short clip of the visualiser — Mediabunny over WebCodecs, entirely in
 * the browser. Nothing is uploaded; the file is built in memory and handed back.
 *
 * Mediabunny plus this module is ~170 kB of muxers and encoder plumbing (~43 kB
 * gzipped), and the visualiser is reachable from the home page (ReleaseGrid
 * and the player bar both mount it), so this module is only ever reached
 * through `import()` from the Record key's handler. Nothing here may be
 * imported statically from a component (`import type` is fine).
 *
 * Frames come from `canvas.captureStream()`, not Mediabunny's CanvasSource.
 * The GPU visuals draw with `preserveDrawingBuffer: false`, so a frame grabbed
 * from a timer outside their rAF is allowed to read back a cleared (black)
 * buffer; the capture stream is fed as the canvas is presented, which is the
 * frame the listener actually saw.
 */

export const CLIP_DEFAULT_SECONDS = 8;
export const CLIP_MIN_SECONDS = 1;
export const CLIP_MAX_SECONDS = 15;
export const CLIP_DEFAULT_FPS = 30;
const CLIP_MIN_FPS = 12;
const CLIP_MAX_FPS = 60;
/**
 * Longest edge of the encoded clip. The GPU canvas runs at up to 1.75× DPR, so a
 * wide panel can be ~1900 px across; encoding that in real time on a phone's
 * software encoder drops frames, and nobody shares an 8-second visualiser loop
 * at more than 720p.
 */
const CLIP_MAX_EDGE = 1280;

export type ClipErrorCode = "unsupported" | "aborted" | "failed";

/** Every failure leaves here as one of these, so the UI can word it honestly. */
export class ClipRecorderError extends Error {
  readonly code: ClipErrorCode;
  constructor(code: ClipErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ClipRecorderError";
    this.code = code;
    if (options && "cause" in options) (this as { cause?: unknown }).cause = options.cause;
  }
}

export interface ClipProgress {
  phase: "recording" | "finalizing";
  /** 0..1 of the requested length. */
  fraction: number;
  elapsed: number;
  seconds: number;
  /**
   * An audio track is being muxed. Settled before the first tick, so a live
   * readout never claims sound that the planner has already dropped.
   */
  hasAudio: boolean;
  /** As on ClipResult: sound was offered but can't be encoded here. */
  audioDropped: boolean;
}

export interface RecordClipOptions {
  /** Clip length; defaults to 8, clamped to 1–15. */
  seconds?: number;
  /** Capture rate; defaults to 30. */
  fps?: number;
  /** A live audio track to mux in. The caller owns it and stops it. */
  audio?: MediaStreamTrack | null;
  signal?: AbortSignal;
  onProgress?: (progress: ClipProgress) => void;
}

export interface ClipResult {
  blob: Blob;
  /** Base container type ("video/mp4" / "video/webm") — what Web Share matches on. */
  mimeType: string;
  /** Without the dot: "mp4" or "webm". */
  extension: string;
  hasAudio: boolean;
  /** Sound was offered, but this browser can't encode it into any container we write. */
  audioDropped: boolean;
  seconds: number;
  width: number;
  height: number;
}

/* ── pure helpers (unit-tested) ─────────────────────────────────── */

export function clampClipOptions(opts: { seconds?: number; fps?: number } = {}): {
  seconds: number;
  fps: number;
} {
  const s = opts.seconds;
  const f = opts.fps;
  const seconds =
    typeof s === "number" && Number.isFinite(s)
      ? Math.min(CLIP_MAX_SECONDS, Math.max(CLIP_MIN_SECONDS, s))
      : CLIP_DEFAULT_SECONDS;
  const fps =
    typeof f === "number" && Number.isFinite(f)
      ? Math.min(CLIP_MAX_FPS, Math.max(CLIP_MIN_FPS, Math.round(f)))
      : CLIP_DEFAULT_FPS;
  return { seconds, fps };
}

/**
 * Encoded size for a canvas: scaled so the long edge fits CLIP_MAX_EDGE, and
 * both sides even — H.264 rejects odd dimensions with 4:2:0 chroma, and the
 * visualiser canvas is sized by `clientWidth × DPR`, which is odd half the time.
 */
export function clipDimensions(
  width: number,
  height: number,
  maxEdge = CLIP_MAX_EDGE
): { width: number; height: number } {
  const w = Math.max(1, width || 1);
  const h = Math.max(1, height || 1);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(w), height: even(h) };
}

/** "pulsar-<release>-clip.<ext>", safe on every filesystem a phone shares to. */
export function clipFileName(title: string | null | undefined, extension: string): string {
  const slug = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "Don't" → "dont", not "don-t".
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return `pulsar-${slug || "release"}-clip.${extension.replace(/^\./, "")}`;
}

export interface EncodeCaps {
  canEncodeVideo: typeof canEncodeVideo;
  canEncodeAudio: typeof canEncodeAudio;
}

export interface ClipFormatSpec {
  width: number;
  height: number;
  fps: number;
  /** Shape of the audio on offer, or null for a silent clip. */
  audio: { sampleRate: number; numberOfChannels: number } | null;
  quality?: Quality;
}

export interface ClipPlan {
  container: "mp4" | "webm";
  videoCodec: "avc" | "vp9" | "vp8";
  audioCodec: "aac" | "opus" | null;
  /** Rate to resample to when the encoder can't take the source's own. */
  audioSampleRate: number | null;
  audioDropped: boolean;
}

const AAC_RATES = [44100, 48000];
/** Opus is defined at 48 kHz; feed it that rather than trust every encoder to resample. */
const OPUS_RATE = 48000;

/**
 * Pick the container and codecs this browser can actually encode.
 *
 * MP4/H.264 first: it is the one file every phone gallery, messenger and
 * desktop player opens. WebM (VP9, then VP8) is the fallback — Chromium builds
 * without a licensed H.264 encoder, and Firefox, land there. Sound goes AAC in
 * MP4 or Opus in WebM. When there IS sound and MP4 can't carry it (Chrome on
 * Linux encodes H.264 but not AAC), WebM-with-sound beats MP4-without; only if
 * neither container can take the sound do we fall back to a silent clip, and
 * say so (`audioDropped`) rather than hand over a file that's quietly mute.
 *
 * Each canEncode* call configures a throwaway encoder, so ask lazily and stop
 * at the first answer that works.
 */
export async function planClipFormat(caps: EncodeCaps, spec: ClipFormatSpec): Promise<ClipPlan | null> {
  // The capture source forces realtime latency; check the config it will use.
  const videoOpts = {
    width: spec.width,
    height: spec.height,
    frameRate: spec.fps,
    latencyMode: "realtime" as const,
    ...(spec.quality ? { quality: spec.quality } : {}),
  };
  const firstVideo = async <C extends ClipPlan["videoCodec"]>(codecs: readonly C[]): Promise<C | null> => {
    for (const codec of codecs) {
      if (await caps.canEncodeVideo(codec, videoOpts).catch(() => false)) return codec;
    }
    return null;
  };
  const audioOk = (codec: "aac" | "opus", sampleRate: number) =>
    caps
      .canEncodeAudio(codec, {
        sampleRate,
        numberOfChannels: spec.audio?.numberOfChannels ?? 2,
        ...(spec.quality ? { quality: spec.quality } : {}),
      })
      .catch(() => false);

  const mp4Video = await firstVideo(["avc"] as const);
  let webm: ClipPlan["videoCodec"] | null | undefined; // undefined = not asked yet
  const webmVideo = async () => (webm === undefined ? (webm = await firstVideo(["vp9", "vp8"] as const)) : webm);

  if (spec.audio) {
    const rate = spec.audio.sampleRate;
    if (mp4Video) {
      const aacRate = AAC_RATES.includes(rate) ? rate : 48000;
      if (await audioOk("aac", aacRate)) {
        return {
          container: "mp4",
          videoCodec: mp4Video,
          audioCodec: "aac",
          audioSampleRate: aacRate === rate ? null : aacRate,
          audioDropped: false,
        };
      }
    }
    const wv = await webmVideo();
    if (wv && (await audioOk("opus", OPUS_RATE))) {
      return {
        container: "webm",
        videoCodec: wv,
        audioCodec: "opus",
        audioSampleRate: rate === OPUS_RATE ? null : OPUS_RATE,
        audioDropped: false,
      };
    }
  }

  const audioDropped = spec.audio !== null;
  if (mp4Video) {
    return { container: "mp4", videoCodec: mp4Video, audioCodec: null, audioSampleRate: null, audioDropped };
  }
  const wv = await webmVideo();
  if (wv) return { container: "webm", videoCodec: wv, audioCodec: null, audioSampleRate: null, audioDropped };
  return null;
}

/* ── audio ──────────────────────────────────────────────────────── */

export interface AudioTap {
  track: MediaStreamTrack;
  /**
   * Peak (0..1) of the samples flowing to the track right now, or null if
   * this engine can't say. A paused or missing preview still feeds the track,
   * as exact zeros, so a muxed audio track alone doesn't prove the clip has sound.
   */
  level: () => number | null;
  release: () => void;
}

/**
 * A recordable copy of the preview's sound, taken from the player's analyser.
 *
 * Why not `audioEl.captureStream()`: PlayerProvider doesn't expose its element,
 * and Firefox's capture mutes the element it captures. Why this is safe for
 * playback: the analyser already sits in the desktop-only Web Audio graph
 * (element → analyser → speakers). Connecting it to one more destination is a
 * fan-out — the existing path to the speakers is untouched, nothing is
 * rerouted, and `release()` removes only the branch it added. On touch devices
 * there is no graph (routing the element through an AudioContext broke mobile
 * playback — see LevelMeter), `analyser` is null, and the clip is silent.
 */
export async function tapAnalyserAudio(analyser: AnalyserNode | null): Promise<AudioTap | null> {
  if (!analyser) return null;
  const ctx = analyser.context as BaseAudioContext & Partial<Pick<AudioContext, "createMediaStreamDestination">>;
  if (typeof ctx.createMediaStreamDestination !== "function") return null;
  if (ctx.state !== "running") {
    // A suspended context yields no samples at all, which would leave an empty
    // audio track. Give resume() a moment (we're just after a tap), then give up.
    const resume = (ctx as AudioContext).resume?.().catch(() => {});
    await Promise.race([resume, new Promise((r) => setTimeout(r, 400))]);
    if ((ctx.state as AudioContextState) !== "running") return null;
  }
  try {
    const dest = ctx.createMediaStreamDestination();
    analyser.connect(dest);
    const track = dest.stream.getAudioTracks()[0];
    const release = () => {
      try {
        analyser.disconnect(dest);
      } catch {
        /* already gone with the context */
      }
      track?.stop();
    };
    if (!track) {
      release();
      return null;
    }
    // Time-domain only: the visual reads the frequency data, and every
    // frequency read advances the analyser's smoothing, so reading that here
    // as well would change how the bars move.
    const samples = new Float32Array(analyser.fftSize);
    const level = () => {
      if (typeof analyser.getFloatTimeDomainData !== "function") return null;
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const s of samples) peak = Math.max(peak, Math.abs(s));
      return peak;
    };
    return { track, level, release };
  } catch {
    return null;
  }
}

/* ── the Record key's flow ──────────────────────────────────────── */

export interface ClipTake {
  file: File;
  /** Web Share can take this file (phones); otherwise it's offered as a download. */
  canShare: boolean;
  sound: boolean;
  /** What the clip lacks and why, in the listener's terms — or null. */
  note: string | null;
  /** The LCD line: "Clip ready · WebM · 302 KB". */
  head: string;
}

export interface TakeProgress extends ClipProgress {
  /** The LCD line: "Rec 0:03 / 0:08", then "Encoding…". */
  head: string;
  /** Sound has actually reached the clip so far, not merely a track for it. */
  sound: boolean;
  note: string | null;
}

/** The player's state as the take sees it (PlayerProvider's own fields). */
export interface PreviewState {
  /** A preview is loaded for the current record. */
  hasAudio: boolean;
  /** One is still being fetched: it may yet arrive mid-take. */
  loading: boolean;
  playing: boolean;
}

/** −60 dBFS. A paused element feeds exact zeros; anything below this is inaudible anyway. */
const SILENCE_FLOOR = 0.001;

const fmtClock = (s: number) => `0:${String(Math.floor(s)).padStart(2, "0")}`;

const fmtSize = (bytes: number) =>
  bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

/**
 * Everything the Visualizer's Record key does after the tap, from the sound
 * tap to a named File, down to the wording of its status line. It lives here
 * rather than in the component so that none of it ships in the home page's
 * first load — only the key itself does.
 */
export async function takeClip(opts: {
  /** The visual's canvas; null when the engine failed to start (no WebGL2). */
  canvas: HTMLCanvasElement | null;
  analyser: AnalyserNode | null;
  title: string;
  /**
   * The player's state right now. It's read on every tick, so the readout
   * follows play and pause during the take. Without it the analyser's level
   * is the only evidence of sound.
   */
  preview?: () => PreviewState;
  seconds?: number;
  signal?: AbortSignal;
  onProgress?: (progress: TakeProgress) => void;
}): Promise<ClipTake> {
  const { canvas, preview } = opts;
  if (!canvas) throw new ClipRecorderError("unsupported", "Nothing to record — this visual isn't drawing.");
  const atStart = preview?.();
  // No preview and none on the way: there's nothing to tap, and "press play"
  // would point at a disabled key.
  const noPreview = !!atStart && !atStart.hasAudio && !atStart.loading;
  const tap = noPreview ? null : await tapAnalyserAudio(opts.analyser);
  const touch = window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
  /** Why the clip has no audio track at all. */
  const trackless = (t: { audioDropped: boolean }) =>
    t.audioDropped
      ? "Video only: this browser can't encode the sound"
      : noPreview
        ? "No preview for this record: the clip will be silent"
        : touch
          ? "Video only: sound can't be captured on this device"
          : "Video only: sound capture isn't available right now";

  // A track is muxed whenever the tap exists, but it only carries sound once
  // the preview plays through it, so listen to what goes in.
  let heard = false;
  let played = false;
  const listen = (now: PreviewState | undefined) => {
    if (now?.playing) played = true;
    if (heard || !tap) return;
    const level = tap.level();
    heard = level === null ? (now?.playing ?? true) : level > SILENCE_FLOOR;
  };
  /** The note for a clip with an audio track: live advice, then the verdict. */
  const soundNote = (now: PreviewState | undefined, live: boolean) =>
    live
      ? now && !now.playing && now.hasAudio
        ? "Preview paused: press play to record sound"
        : null
      : heard
        ? null
        : played
          ? "Video only: no sound reached the recorder"
          : "Video only: the preview wasn't playing during the take";

  try {
    const result = await recordCanvasClip(canvas, {
      seconds: opts.seconds,
      audio: tap?.track ?? null,
      signal: opts.signal,
      onProgress: (p) => {
        const now = preview?.();
        const live = p.phase === "recording";
        if (live && p.hasAudio) listen(now);
        opts.onProgress?.({
          ...p,
          head: live ? `Rec ${fmtClock(p.elapsed)} / ${fmtClock(p.seconds)}` : "Encoding…",
          sound: p.hasAudio && heard,
          note: p.hasAudio ? soundNote(now, live) : trackless(p),
        });
      },
    });
    const file = new File([result.blob], clipFileName(opts.title, result.extension), { type: result.mimeType });
    // Share on phones, where the sheet is how a video reaches the camera roll
    // or a chat. Desktop share sheets (Windows, macOS) have no "save to disk"
    // target, so there a download is the useful action.
    let canShare = false;
    try {
      canShare = touch && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
    } catch {
      /* canShare throws on some engines for unknown types — download instead */
    }
    return {
      file,
      canShare,
      sound: result.hasAudio && heard,
      note: result.hasAudio ? soundNote(undefined, false) : trackless(result),
      head: `Clip ready · ${result.extension === "mp4" ? "MP4" : "WebM"} · ${fmtSize(file.size)}`,
    };
  } finally {
    tap?.release();
  }
}

/** Save a finished clip as a download. */
export function downloadClipFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Hand a finished clip over: the share sheet where it can take the file,
 * otherwise a download. Call it synchronously from the tap — share() needs
 * the user's gesture, and an await in front of it can spend that.
 */
export async function saveClipFile(file: File, canShare: boolean): Promise<void> {
  if (canShare) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if ((err as DOMException | null)?.name === "AbortError") return;
      // Anything else (no share target, a lost gesture): save it instead.
    }
  }
  downloadClipFile(file);
}

/* ── recording ──────────────────────────────────────────────────── */

const abortError = () => new ClipRecorderError("aborted", "Recording cancelled.");

/** Throws `unsupported` before any work starts if this browser can't do the job. */
function assertCanRecord(canvas: HTMLCanvasElement) {
  if (typeof window === "undefined") {
    throw new ClipRecorderError("unsupported", "Clips can only be recorded in the browser.");
  }
  if (typeof VideoEncoder === "undefined") {
    throw new ClipRecorderError(
      "unsupported",
      "This browser can't encode video (no WebCodecs). Try a current Chrome, Edge, Firefox or Safari."
    );
  }
  if (typeof canvas.captureStream !== "function") {
    throw new ClipRecorderError("unsupported", "This browser can't capture the visualiser canvas.");
  }
}

/**
 * Record `seconds` of `canvas` (plus `audio`, when given) into an MP4 or WebM
 * blob. Real time: resolves roughly `seconds` after it starts, plus a moment to
 * finalise. Abort the signal to stop early — the output is cancelled and
 * nothing is returned.
 */
export async function recordCanvasClip(
  canvas: HTMLCanvasElement,
  options: RecordClipOptions = {}
): Promise<ClipResult> {
  const { seconds, fps } = clampClipOptions(options);
  const { signal, onProgress } = options;
  if (signal?.aborted) throw abortError();
  assertCanRecord(canvas);

  const { width, height } = clipDimensions(canvas.width, canvas.height);
  const offered = options.audio;
  const audioTrack =
    offered && offered.kind === "audio" && offered.readyState === "live" ? (offered as MediaStreamAudioTrack) : null;
  const audioSettings = audioTrack?.getSettings();
  const quality = new Quality("high");

  const plan = await planClipFormat(
    { canEncodeVideo, canEncodeAudio },
    {
      width,
      height,
      fps,
      quality,
      audio: audioTrack
        ? {
            sampleRate: audioSettings?.sampleRate ?? 48000,
            numberOfChannels: audioSettings?.channelCount ?? 2,
          }
        : null,
    }
  );
  if (!plan) {
    throw new ClipRecorderError("unsupported", "This browser can't encode H.264, VP9 or VP8 video.");
  }
  if (signal?.aborted) throw abortError();

  const stream = canvas.captureStream(fps);
  const videoTrack = stream.getVideoTracks()[0];
  let output: Output | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let onAbort: (() => void) | null = null;

  try {
    if (!videoTrack) throw new ClipRecorderError("unsupported", "This browser can't capture the visualiser canvas.");

    const format = plan.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat();
    const target = new BufferTarget();
    output = new Output({ format, target });

    const videoSource = new MediaStreamVideoTrackSource(
      videoTrack,
      {
        codec: plan.videoCodec,
        quality,
        // The first frame fixes the box; if the canvas is resized mid-take
        // (rotation, window resize) later frames are letterboxed into it
        // instead of the encoder throwing.
        sizeChangeBehavior: "contain",
        transform: { width, height },
      },
      // A fixed rate: the capture stream only emits when the canvas repaints,
      // and a constant-fps file is what every player and editor expects.
      { frameRate: fps }
    );
    output.addVideoTrack(videoSource, { frameRate: fps });

    let audioSource: MediaStreamAudioTrackSource | null = null;
    if (plan.audioCodec && audioTrack) {
      audioSource = new MediaStreamAudioTrackSource(audioTrack, {
        codec: plan.audioCodec,
        quality,
        ...(plan.audioSampleRate ? { transform: { sampleRate: plan.audioSampleRate } } : {}),
      });
      output.addAudioTrack(audioSource);
    }

    // The sources report encoder failures on a promise that only ever rejects;
    // race every wait against it (and against the abort) so a dead encoder
    // can't leave the UI recording forever.
    const failure = new Promise<never>((_, reject) => {
      videoSource.errorPromise.catch(reject);
      audioSource?.errorPromise.catch(reject);
      onAbort = () => reject(abortError());
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    failure.catch(() => {});

    await Promise.race([output.start(), failure]);

    const tracks = { hasAudio: audioSource !== null, audioDropped: plan.audioDropped };
    const startedAt = performance.now();
    await Promise.race([
      failure,
      new Promise<void>((resolve) => {
        const tick = () => {
          const elapsed = Math.min(seconds, (performance.now() - startedAt) / 1000);
          onProgress?.({ phase: "recording", fraction: elapsed / seconds, elapsed, seconds, ...tracks });
          if (elapsed >= seconds) resolve();
        };
        tick();
        // A timer, not rAF: rAF stops in a background tab and the take would
        // never end. Ten updates a second is plenty for a progress ring.
        ticker = setInterval(tick, 100);
      }),
    ]);
    if (ticker) clearInterval(ticker);
    ticker = null;

    onProgress?.({ phase: "finalizing", fraction: 1, elapsed: seconds, seconds, ...tracks });
    await Promise.race([output.finalize(), failure]);
    // Cancelling during the final flush can't stop it, but the listener asked
    // for nothing, so give them nothing.
    if (signal?.aborted) throw abortError();

    const buffer = target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new ClipRecorderError("failed", "The clip came out empty.");
    }
    return {
      blob: new Blob([buffer], { type: format.mimeType }),
      mimeType: format.mimeType,
      extension: format.fileExtension.replace(/^\./, ""),
      ...tracks,
      seconds,
      width,
      height,
    };
  } catch (err) {
    if (output && output.state !== "finalized") await output.cancel().catch(() => {});
    if (signal?.aborted) throw abortError();
    if (err instanceof ClipRecorderError) throw err;
    throw new ClipRecorderError(
      "failed",
      `Couldn't encode the clip${err instanceof Error && err.message ? ` — ${err.message}` : ""}.`,
      { cause: err }
    );
  } finally {
    if (ticker) clearInterval(ticker);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    // Our capture track keeps the canvas feeding a stream nobody reads; stop it.
    // The audio track belongs to the caller.
    stream.getTracks().forEach((t) => t.stop());
  }
}
