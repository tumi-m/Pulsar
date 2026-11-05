/**
 * Picking a container and codec for "Download video" (browser rendering).
 *
 * What a browser can encode varies more than what it can play: Chrome and Edge
 * ship an H.264 encoder, the open-source Chromium (and so Playwright's) does
 * not, Firefox encodes VP8/VP9, Safari only from 26. So the exporter asks
 * rather than assumes — H.264 MP4 first, because it's what every phone and
 * social app takes, then WebM VP9, then VP8 — and if audio is what fails, it
 * keeps the video and drops the soundtrack rather than giving up.
 *
 * `canRender` is @remotion/web-renderer's canRenderMediaOnWeb, injected so
 * this stays testable and the renderer stays out of any bundle until used.
 */

export type ExportContainer = "mp4" | "webm";
export type ExportVideoCodec = "h264" | "vp9" | "vp8";

export type ExportTarget = {
  container: ExportContainer;
  videoCodec: ExportVideoCodec;
  /** Bits per second for the video track (see EXPORT_CANDIDATES). */
  videoBitrate: number;
  muted: boolean;
  extension: ExportContainer;
  mimeType: string;
};

type Issue = { type: string; message: string; severity: "error" | "warning" };
export type CanRender = (options: {
  container: ExportContainer;
  videoCodec: ExportVideoCodec;
  videoBitrate: number;
  width: number;
  height: number;
  muted: boolean;
}) => Promise<{ canRender: boolean; issues: Issue[] }>;

/**
 * Bitrates are explicit because the renderer's default ("medium") works out
 * at ~1.9 Mb/s for VP9 at 1080 × 1920: the browser's real-time encoder smeared
 * the J-card's ruled lines and screws into blocks on every moving frame, and
 * the file is bound for Stories, which encode it again. These sit at ~6-8 Mb/s
 * — clean on the moving cards, and a full twelve-record (23 s) recap is still
 * a ~20 MB download. VP9 gets less for the same picture; VP8 needs more.
 */
export const EXPORT_CANDIDATES: readonly {
  container: ExportContainer;
  videoCodec: ExportVideoCodec;
  videoBitrate: number;
}[] = [
  { container: "mp4", videoCodec: "h264", videoBitrate: 8_000_000 },
  { container: "webm", videoCodec: "vp9", videoBitrate: 6_000_000 },
  { container: "webm", videoCodec: "vp8", videoBitrate: 8_000_000 },
];

export type ExportChoice =
  | { target: ExportTarget; droppedAudio: boolean; reason: null }
  | { target: null; droppedAudio: false; reason: string };

/** Synchronous first look, safe on the server: no WebCodecs means no encoding at all. */
export function browserCanEncode(): boolean {
  return typeof globalThis !== "undefined" && typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === "function";
}

export async function chooseExportTarget(
  canRender: CanRender,
  { width, height, withAudio }: { width: number; height: number; withAudio: boolean }
): Promise<ExportChoice> {
  const issues: Issue[] = [];
  // With sound first (when asked for), then the same list silent.
  const passes = withAudio ? [false, true] : [true];
  for (const muted of passes) {
    for (const c of EXPORT_CANDIDATES) {
      let result: Awaited<ReturnType<CanRender>>;
      try {
        result = await canRender({ ...c, width, height, muted });
      } catch (err) {
        issues.push({ type: "check-failed", message: err instanceof Error ? err.message : String(err), severity: "error" });
        continue;
      }
      if (result.canRender) {
        return {
          target: {
            ...c,
            muted,
            extension: c.container,
            mimeType: c.container === "mp4" ? "video/mp4" : "video/webm",
          },
          droppedAudio: withAudio && muted,
          reason: null,
        };
      }
      issues.push(...result.issues.filter((i) => i.severity === "error"));
    }
  }
  return { target: null, droppedAudio: false, reason: explain(issues) };
}

/** One honest sentence for the visitor, from the renderer's list of issues. */
export function explain(issues: readonly Issue[]): string {
  if (issues.length === 0 || issues.some((i) => i.type === "webcodecs-unavailable")) {
    return "This browser can't encode video (it has no WebCodecs). Recent Chrome, Edge or Firefox can, and Safari from version 26.";
  }
  if (issues.every((i) => i.type === "video-codec-unsupported" || i.type === "audio-codec-unsupported")) {
    return "This browser has no video encoder Pulsar can use (H.264, VP9 or VP8). Try recent Chrome, Edge or Firefox.";
  }
  if (issues.some((i) => i.type === "invalid-dimensions")) {
    return "This device can't encode a 1080 × 1920 video.";
  }
  return issues[0].message;
}

/** "road-trip-recap.mp4" */
export function exportFilename(slug: string, target: ExportTarget): string {
  return `${slug}-recap.${target.extension}`;
}
