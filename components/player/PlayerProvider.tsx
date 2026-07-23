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
    if (!ctxRef.current) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.55;
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
      ensureGraph(); // synchronous, inside the tap gesture (iOS unlock)

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
        await audio.play().catch(() => {});
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
      ensureGraph();
      const reqId = ++reqIdRef.current;
      void reqId;
      setCurrent(display);
      setLoading(false);
      setHasAudio(true);
      setProgress(0);
      audio.src = previewUrl;
      audio.load();
      audio.play().catch(() => {});
    },
    [ensureGraph]
  );

  // Keep a stable ref to play() so the audio "ended" handler can advance.
  useEffect(() => {
    playRef.current = play;
  }, [play]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;
    ensureGraph();
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [hasAudio, ensureGraph]);

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
        play, playDirect, toggle, toggleShuffle, stop, seek, setNextProvider, getAnalyser,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
