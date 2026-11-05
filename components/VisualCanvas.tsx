"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";
import type { WmpMode } from "./WmpVisual";

// The visual engines are heavy (WebGL2 shaders / Canvas2D rAF loops) and never
// render on the server — code-split them out of the main bundle.
const GpuVisual = dynamic(() => import("./GpuVisual").then((m) => m.GpuVisual), {
  ssr: false,
});
const WmpVisual = dynamic(() => import("./WmpVisual").then((m) => m.WmpVisual), {
  ssr: false,
});

export type VisualMode =
  | "bars"
  | "waves"
  | "ambience"
  | "tunnel"
  | "liquid"
  | "pulse"
  | "nebula"
  | "silhouette"
  | "aurora"
  | "crowd"
  | "art"
  | "video";

// Video leads — it's the marquee mode; classic media-player visualisations follow.
export const VISUAL_MODES: { id: VisualMode; label: string }[] = [
  { id: "video", label: "Video" },
  { id: "bars", label: "Bars" },
  { id: "waves", label: "Waves" },
  { id: "tunnel", label: "Tunnel" },
  { id: "liquid", label: "Liquid" },
  { id: "pulse", label: "Pulse" },
  { id: "nebula", label: "Nebula" },
  { id: "ambience", label: "Ambience" },
  { id: "silhouette", label: "Kaleido" },
  { id: "art", label: "Cover" },
];

const WMP_MODES: Record<string, WmpMode> = {
  bars: "bars",
  waves: "waves",
  ambience: "ambience",
};

/**
 * The visualiser surface. All generative modes are rendered on the GPU
 * (`GpuVisual`, a WebGL2 fragment-shader engine); "Video" mode overlays the
 * free YouTube music video. Reads the SHARED player analyser.
 */
export function VisualCanvas({
  release,
  mode,
  className = "",
}: {
  release: Release | null;
  mode: VisualMode;
  className?: string;
}) {
  const player = usePlayer();
  // "video" = official music video · "live" = a live performance on YouTube.
  const [videoKind, setVideoKind] = useState<"video" | "live">("video");
  useEffect(() => setVideoKind("video"), [release?.id]);

  /*
   * One state object, stamped with the (release, kind) it describes.
   *
   * This used to be three separate pieces of state plus a "reset" effect, and
   * the fetch effect guarded on them: on a release change it ran in the same
   * commit as the reset, saw the PREVIOUS release's videoId/"none", bailed out,
   * and — since its deps didn't change again — never ran. Switching records in
   * Video mode sat on "Finding music video…" forever. Now anything not stamped
   * with the current key simply reads as loading, and the fetch runs whenever
   * the key changes.
   */
  const key = release ? `${release.id}|${videoKind}` : "";
  const [lookup, setLookup] = useState<{
    key: string;
    videoId: string | null;
    failed: boolean; // the lookup itself failed, as opposed to "no video exists"
  } | null>(null);
  const current = lookup?.key === key ? lookup : null;
  const videoId = current?.videoId ?? null;
  const videoState: "loading" | "none" | "unavailable" | "idle" = !current
    ? "loading"
    : current.videoId
      ? "idle"
      : current.failed
        ? "unavailable"
        : "none";

  const playing = player.playing;
  const toggle = player.toggle;
  useEffect(() => {
    if (mode !== "video" || !release) return;
    // Pause the 30s preview so its audio doesn't clash with the video.
    if (playing) toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, release?.id]);

  useEffect(() => {
    if (mode !== "video" || !release || lookup?.key === key) return;
    const ctrl = new AbortController();
    fetch(
      `/api/ytvideo?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}&kind=${videoKind}`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((data: { videoId: string | null; reason?: string }) => {
        // The route says WHY there's no id. "no-key" and "api-error" mean the
        // lookup failed, not that the record has no video — every consumer
        // used to throw the reason away and blame the record.
        const failed = !data.videoId && (data.reason === "no-key" || data.reason === "api-error");
        setLookup({ key, videoId: data.videoId ?? null, failed });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLookup({ key, videoId: null, failed: true });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, key]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {WMP_MODES[mode] && (
        <WmpVisual
          release={release}
          mode={WMP_MODES[mode]}
          className="absolute inset-0 h-full w-full"
        />
      )}
      {mode !== "video" && !WMP_MODES[mode] && (
        <GpuVisual release={release} mode={mode} className="absolute inset-0 h-full w-full" />
      )}
      {mode === "video" && (
        <div className="absolute inset-0 z-[6] bg-black">
          {videoId ? (
            <iframe
              key={videoId}
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={release ? `${release.title} — ${videoKind === "live" ? "live performance" : "music video"}` : "music video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-ink/45">
                {videoState === "unavailable"
                  ? "Video lookup is unavailable right now"
                  : videoState === "none"
                    ? videoKind === "live"
                      ? "No live performance found"
                      : "No music video found"
                    : videoKind === "live"
                      ? "Finding live performance…"
                      : "Finding music video…"}
              </p>
              {(videoState === "unavailable" || videoState === "none") && release && (
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                    `${release.artist} ${release.title}${videoKind === "live" ? " live" : ""}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold uppercase tracking-widest text-tps hover:underline"
                >
                  Find it on YouTube
                </a>
              )}
              {videoState === "loading" && (
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-sony" />
              )}
            </div>
          )}

          {/* Official ↔ Live performance toggle */}
          <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
            <div
              className="glass flex items-center gap-0.5 rounded-full border border-white/15 p-0.5"
              style={{
                background: "rgba(10,10,18,0.66)",
              }}
            >
              {(["video", "live"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setVideoKind(k)}
                  className={`rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors ${
                    videoKind === k ? "bg-white text-deck" : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {k === "video" ? "Official" : "Live"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
