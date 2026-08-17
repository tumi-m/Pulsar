"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper over the YouTube IFrame Player API.
 *
 * The point of this is timestamps. No openly-licensed source publishes where in
 * a track a sample lands — WhoSampled's timings are hand-annotated proprietary
 * data — so Pulsar captures them from the listener instead. Asking someone to
 * type "1:15" into a box while they listen is miserable; letting them hit one
 * button at the moment they hear it is the whole feature. That needs the
 * playhead, which a plain `<iframe>` will not give you.
 *
 * Everything degrades: if the API script is blocked, slow, or unavailable the
 * hook reports `ready: false` and the caller falls back to a normal embed with
 * manual entry, which is exactly what existed before.
 */

/** Only the surface we actually call. */
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}

type WindowWithYT = Window & {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<boolean> | null = null;

/** Load the IFrame API once per page. Resolves false when it can't be had. */
function loadApi(): Promise<boolean> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const w = window as WindowWithYT;
    if (w.YT?.Player) {
      resolve(true);
      return;
    }
    // Six seconds is generous for a CDN script; past that the fallback embed is
    // a better experience than a spinner.
    const timer = window.setTimeout(() => resolve(false), 6000);
    // Chain rather than clobber — the API only ever calls one global, and
    // something else on the page may have registered first.
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      prev?.();
      resolve(true);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export type YouTubeStatus = "idle" | "loading" | "ready" | "unavailable";

export interface YouTubeHandle {
  /** Stable wrapper element — the API replaces a child of this, not this. */
  hostRef: React.RefObject<HTMLDivElement | null>;
  /**
   * "unavailable" is the signal to render a plain `<iframe>` instead: the API
   * script never arrived, so there is no playhead to read.
   */
  status: YouTubeStatus;
  /** Playhead in seconds, or null when there's no live player. */
  currentTime: () => number | null;
  seek: (seconds: number) => void;
}

/**
 * Mount a controllable player for `videoId` while `enabled`, starting at
 * `startSeconds`. Switching `videoId` reloads in place (no iframe churn), which
 * is what makes the A/B toggle between a song and its source feel instant.
 */
export function useYouTubePlayer(
  videoId: string | null,
  enabled: boolean,
  startSeconds = 0
): YouTubeHandle {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [status, setStatus] = useState<YouTubeStatus>("idle");

  // Read at player-creation time only — a changing start must not re-run the
  // effect and tear the player down mid-play.
  const startRef = useRef(startSeconds);
  startRef.current = startSeconds;

  useEffect(() => {
    if (!enabled || !videoId) return;
    let cancelled = false;
    setStatus((s) => (s === "ready" ? s : "loading"));

    loadApi().then((ok) => {
      if (cancelled) return;
      const host = hostRef.current;
      const YT = (window as WindowWithYT).YT;
      if (!ok || !host || !YT?.Player) {
        setStatus("unavailable");
        return;
      }

      if (playerRef.current) {
        playerRef.current.loadVideoById({
          videoId,
          startSeconds: Math.max(0, Math.floor(startRef.current)),
        });
        return;
      }

      // YT.Player REPLACES the element it's given with an iframe, so hand it a
      // throwaway child and keep the wrapper for React.
      const mount = document.createElement("div");
      mount.style.width = "100%";
      mount.style.height = "100%";
      host.appendChild(mount);

      playerRef.current = new YT.Player(mount, {
        videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          start: Math.max(0, Math.floor(startRef.current)),
        },
        events: {
          onReady: () => {
            if (!cancelled) setStatus("ready");
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [videoId, enabled]);

  // Tear down when the card stops showing a player, so closing a panel never
  // leaves audio running underneath it.
  useEffect(() => {
    if (enabled) return;
    try {
      playerRef.current?.destroy();
    } catch {
      /* already gone */
    }
    playerRef.current = null;
    if (hostRef.current) hostRef.current.innerHTML = "";
    setStatus("idle");
  }, [enabled]);

  // Same on unmount.
  useEffect(
    () => () => {
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
    },
    []
  );

  const currentTime = useCallback(() => {
    try {
      const t = playerRef.current?.getCurrentTime();
      return typeof t === "number" && Number.isFinite(t) ? t : null;
    } catch {
      return null;
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    try {
      playerRef.current?.seekTo(Math.max(0, seconds), true);
      playerRef.current?.playVideo();
    } catch {
      /* no player — the caller's fallback embed handles start time via URL */
    }
  }, []);

  return { hostRef, status, currentTime, seek };
}
