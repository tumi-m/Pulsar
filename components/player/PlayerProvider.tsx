"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { Release } from "@/lib/types";

/**
 * Global preview player — the shared audio surface behind the
 * Now-Playing bar (Apple/Spotify/Tidal-style). Any tile can start a 30s
 * preview inline while the user keeps browsing. One <audio> element;
 * the Now-Playing bar and quick-play buttons all read this context.
 */

interface PlayerCtx {
  current: Release | null;
  playing: boolean;
  loading: boolean;
  progress: number; // 0..1
  hasAudio: boolean;
  shuffle: boolean;
  play: (release: Release) => void;
  playDirect: (display: Release, previewUrl: string) => void;
  toggle: () => void;
  toggleShuffle: () => void;
  stop: () => void;
  seek: (fraction: number) => void;
  /** ReleaseGrid registers a picker that returns the next taste-ranked
   *  release to play when a preview ends in shuffle mode. */
  setNextProvider: (fn: ((current: Release | null) => Release | null) | null) => void;
  /** Build the analyser graph (desktop only) — called from the visualiser's
   *  open gesture so audio reactivity is available without touching mobile
   *  playback reliability. */
  ensureGraph: () => AnalyserNode | null;
  /** Shared Web Audio analyser (created on the first gesture-driven play).
   *  The visualizer reads this so it reliably tracks the already-playing
   *  audio — critical on iOS/Safari where autoplay is blocked. */
  getAnalyser: () => AnalyserNode | null;
}

const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Release | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const reqIdRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const shuffleRef = useRef(false);
  const currentRef = useRef<Release | null>(null);
  const nextProviderRef = useRef<((current: Release | null) => Release | null) | null>(null);
  const playRef = useRef<((release: Release) => void) | null>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Build the Web Audio graph once, on a user gesture. iOS requires the
  // AudioContext be created/resumed inside a gesture, so this is called
  // from play()/playDirect()/toggle().
  const ensureGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;
    // Never build the Web Audio graph on touch/mobile: routing the <audio>
    // element through an AudioContext (which mobile keeps suspending) makes
    // playback unreliable. Mobile visuals use the time-based fallback instead.
    const isTouch =
      typeof window !== "undefined" &&
      ((window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        "ontouchstart" in window);
    if (isTouch) return null;
    if (!ctxRef.current) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.45; // snappier, more in-sync with beats
        const source = ctx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
    return analyserRef.current;
  }, []);

  const getAnalyser = useCallback(() => analyserRef.current, []);

  // iOS/mobile audio unlock. Safari blocks a play() that isn't inside a user
  // gesture — and ours runs after an async preview fetch, which loses the
  // gesture. On the first touch we (a) resume the AudioContext and (b) prime
  // the <audio> element with a silent clip so later programmatic play() calls
  // are allowed. Runs once, and never touches src after that so it can't
  // interrupt real playback.
  const unlockedRef = useRef(false);
  useEffect(() => {
    const unlock = () => {
      ctxRef.current?.resume?.().catch(() => {});
      const audio = audioRef.current;
      if (audio && !unlockedRef.current) {
        unlockedRef.current = true;
        const SILENT =
          "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
        const prevSrc = audio.src;
        audio.src = SILENT;
        audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            if (!prevSrc) audio.removeAttribute("src");
          })
          .catch(() => {});
      }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("touchend", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("touchend", unlock);
    };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.loop = true; // previews loop by default so the visuals never stop
    // Safari (esp. iOS): must play inline, not fullscreen.
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audioRef.current = audio;

    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      // Shuffle mode: jump to the next release ranked higher for the user.
      if (shuffleRef.current && nextProviderRef.current) {
        const next = nextProviderRef.current(currentRef.current);
        if (next) playRef.current?.(next);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const play = useCallback(
    async (release: Release) => {
      const audio = audioRef.current;
      if (!audio) return;
      // NOTE: we deliberately do NOT route through Web Audio here. Playback is
      // the plain <audio> element so it's reliable on mobile Chrome/Safari (a
      // suspended AudioContext would otherwise play silently). The analyser
      // graph is built lazily, on desktop, only when the visualiser opens.
      if (ctxRef.current?.state === "suspended") ctxRef.current.resume().catch(() => {});

      // Same track → just toggle
      if (current?.id === release.id && hasAudio) {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
        return;
      }

      const reqId = ++reqIdRef.current;
      setCurrent(release);
      setLoading(true);
      setHasAudio(false);
      setProgress(0);
      audio.pause();

      try {
        const res = await fetch(
          `/api/preview?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}`
        );
        if (reqId !== reqIdRef.current) return; // superseded
        if (!res.ok) throw new Error("no preview");
        const data = await res.json();
        if (reqId !== reqIdRef.current) return;
        audio.src = data.previewUrl;
        audio.load();
        setHasAudio(true);
        // Play; retry once — the first mobile play can race the unlock.
        try {
          await audio.play();
        } catch {
          await new Promise((r) => setTimeout(r, 140));
          await audio.play().catch(() => {});
        }
      } catch {
        if (reqId === reqIdRef.current) {
          setHasAudio(false);
          setPlaying(false);
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [current, hasAudio]
  );

  // Play a specific, already-resolved preview URL (e.g. an album track).
  const playDirect = useCallback(
    (display: Release, previewUrl: string) => {
      const audio = audioRef.current;
      if (!audio) return;
      const reqId = ++reqIdRef.current;
      void reqId;
      setCurrent(display);
      setLoading(false);
      setHasAudio(true);
      setProgress(0);
      audio.src = previewUrl;
      audio.load();
      audio.play().catch(async () => {
        await new Promise((r) => setTimeout(r, 140));
        audio.play().catch(() => {});
      });
    },
    []
  );

  // Keep a stable ref to play() so the audio "ended" handler can advance.
  useEffect(() => {
    playRef.current = play;
  }, [play]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;
    if (ctxRef.current?.state === "suspended") ctxRef.current.resume().catch(() => {});
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [hasAudio]);

  // Shuffle: when ON, previews stop looping so "ended" can advance to the
  // next taste-ranked track; when OFF, previews loop as before.
  const toggleShuffle = useCallback(() => {
    setShuffle((on) => {
      const next = !on;
      shuffleRef.current = next;
      const audio = audioRef.current;
      if (audio) audio.loop = !next;
      return next;
    });
  }, []);

  const setNextProvider = useCallback(
    (fn: ((current: Release | null) => Release | null) | null) => {
      nextProviderRef.current = fn;
    },
    []
  );

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setCurrent(null);
    setPlaying(false);
    setHasAudio(false);
    setProgress(0);
  }, []);

  const seek = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        current, playing, loading, progress, hasAudio, shuffle,
        play, playDirect, toggle, toggleShuffle, stop, seek, setNextProvider, ensureGraph, getAnalyser,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
