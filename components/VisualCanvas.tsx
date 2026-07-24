"use client";

import { useEffect, useState } from "react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";
import { GpuVisual } from "./GpuVisual";

export type VisualMode = "nebula" | "silhouette" | "aurora" | "crowd" | "art" | "video";

export const VISUAL_MODES: { id: VisualMode; label: string }[] = [
  { id: "nebula", label: "Nebula" },
  { id: "silhouette", label: "Silhouette" },
  { id: "aurora", label: "Aurora" },
  { id: "art", label: "Cover" },
  { id: "video", label: "Video" },
];

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
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<"idle" | "loading" | "none">("idle");
  // "video" = official music video · "live" = a live performance on YouTube.
  const [videoKind, setVideoKind] = useState<"video" | "live">("video");

  useEffect(() => {
    setVideoId(null);
    setVideoState("idle");
    setVideoKind("video");
  }, [release]);

  // Refetch when the user flips Official ↔ Live.
  useEffect(() => {
    setVideoId(null);
    setVideoState("idle");
  }, [videoKind]);

  // Resolve the YouTube video id the first time "Video" mode opens; pause the
  // 30s preview so its audio doesn't clash.
  useEffect(() => {
    if (mode !== "video" || !release) return;
    if (player.playing) player.toggle();
    if (videoId || videoState === "loading" || videoState === "none") return;
    let cancelled = false;
    setVideoState("loading");
    (async () => {
      try {
        const res = await fetch(
          `/api/ytvideo?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}&kind=${videoKind}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.videoId) {
          setVideoId(data.videoId);
          setVideoState("idle");
        } else {
          setVideoState("none");
        }
      } catch {
        if (!cancelled) setVideoState("none");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, release, videoKind]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {mode !== "video" && (
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
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-star-white/45">
                {videoState === "none"
                  ? videoKind === "live"
                    ? "No live performance found"
                    : "No music video found"
                  : videoKind === "live"
                    ? "Finding live performance…"
                    : "Finding music video…"}
              </p>
              {videoState === "loading" && (
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon-violet" />
              )}
            </div>
          )}

          {/* Official ↔ Live performance toggle */}
          <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
            <div
              className="flex items-center gap-0.5 rounded-full border border-white/15 p-0.5"
              style={{
                background: "rgba(10,10,18,0.66)",
                backdropFilter: "blur(12px) saturate(150%)",
                WebkitBackdropFilter: "blur(12px) saturate(150%)",
              }}
            >
              {(["video", "live"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setVideoKind(k)}
                  className={`rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors ${
                    videoKind === k ? "bg-white text-void" : "text-star-white/60 hover:text-star-white"
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
