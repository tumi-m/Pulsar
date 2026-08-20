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
import { currentUserId, recordListen } from "@/lib/sync";

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
  /** Seconds elapsed / total, so the transport can show real times. */
  elapsed: number;
  duration: number;
  hasAudio: boolean;
  shuffle: boolean;
  /** Last playback error surfaced to the UI (null when healthy). */
  error: string | null;
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

/**
 * 0.05s of true silence — 8kHz mono 8-bit PCM, 400 real frames.
 *
 * The clip this replaced declared a `data` chunk of ZERO bytes: a valid header
 * with no audio behind it. Chromium tolerates that (it fires loadedmetadata,
 * though duration comes back null); Safari is stricter about media it cannot
 * decode, and this unlock exists for Safari. Rather than rely on a malformed
 * file being tolerated, prime with something that genuinely plays.
 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

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
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  /**
   * Prime the <audio> element inside a real user gesture.
   *
   * Safari only allows a programmatic play() if the element has already played
   * once from a genuine user activation. Ours runs AFTER an async preview
   * fetch, which spends the activation — so without this every first play is
   * rejected and the user is told "Playback was blocked".
   *
   * Returns the play promise so callers can wait for it if they need to.
   */
  const unlockAudio = useCallback((): Promise<void> => {
    ctxRef.current?.resume?.().catch(() => {});
    const audio = audioRef.current;
    if (!audio || unlockedRef.current) return Promise.resolve();

    const prevSrc = audio.src;
    audio.src = SILENT_WAV;
    return audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        if (!prevSrc) audio.removeAttribute("src");
        // Only NOW is the element genuinely activated. This flag used to be set
        // BEFORE the attempt, so a single failure permanently disabled
        // unlocking for the rest of the session — the guard `!unlockedRef
        // .current` then skipped every later gesture. That is a certain bug
        // independent of why any given attempt failed.
        unlockedRef.current = true;
      })
      .catch(() => {
        // Leave unlockedRef false so the next gesture tries again.
      });
  }, []);

  useEffect(() => {
    const onGesture = () => {
      void unlockAudio();
    };
    // Capture phase: a component calling stopPropagation() on pointerdown
    // would otherwise stop the unlock from ever running.
    const opts = { capture: true } as const;
    document.addEventListener("pointerdown", onGesture, opts);
    document.addEventListener("touchend", onGesture, opts);
    document.addEventListener("keydown", onGesture, opts);
    return () => {
      document.removeEventListener("pointerdown", onGesture, opts);
      document.removeEventListener("touchend", onGesture, opts);
      document.removeEventListener("keydown", onGesture, opts);
    };
  }, [unlockAudio]);

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
      setElapsed(audio.currentTime || 0);
      if (audio.duration) {
        setDuration(audio.duration);
        setProgress(audio.currentTime / audio.duration);
      }
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
    // Surface load/decode failures instead of failing silently. The audio
    // element's `error` event fires when the (proxied) MP3 502s or is
    // truncated — a top cause of "sometimes music doesn't play".
    const onError = () => {
      if (reqIdRef.current === 0) return;
      setError("Couldn’t load this preview");
      setHasAudio(false);
      setPlaying(false);
      setLoading(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
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

      // Prime the element NOW, synchronously, while we still hold the user
      // activation from the tap that called this. Everything below awaits a
      // network round-trip for the preview URL, and by the time that resolves
      // the activation is spent — which is precisely why playback was being
      // blocked. The document-level listener usually gets here first, but this
      // covers the case where it didn't, or where its attempt failed.
      const unlocking = unlockedRef.current ? null : unlockAudio();

      // Same track → just toggle. Compare id AND title so that an album track
      // (which shares the album's id via playDirect) doesn't short-circuit a
      // real album play into a mute pause toggle.
      if (
        current?.id === release.id &&
        current?.title === release.title &&
        current?.artist === release.artist &&
        hasAudio
      ) {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
        return;
      }

      const reqId = ++reqIdRef.current;
      setCurrent(release);
      setLoading(true);
      setHasAudio(false);
      setProgress(0);
      setError(null);
      audio.pause();

      try {
        const res = await fetch(
          `/api/preview?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}`
        );
        if (reqId !== reqIdRef.current) return; // superseded
        if (!res.ok) throw new Error("no preview");
        const data = await res.json();
        if (reqId !== reqIdRef.current) return;
        if (!data.previewUrl) throw new Error("no preview");
        audio.src = data.previewUrl;
        audio.load();
        setHasAudio(true);
        // Log the listen (signed-in users only) so history feeds the taste
        // engine and the daily-mix feature. Best-effort, fire-and-forget.
        currentUserId()
          .then((uid) => {
            if (uid) void recordListen(uid, release);
          })
          .catch(() => {});
        // Make sure the priming play() has finished before we start the real
        // one — two concurrent play() calls on the same element make Safari
        // reject both. A bare 140ms sleep used to stand in for this and lost
        // the race whenever the silent clip took longer.
        if (unlocking) await unlocking.catch(() => {});
        if (reqId !== reqIdRef.current) return;

        try {
          await audio.play();
        } catch {
          // One retry: on a cold element the src may not be ready on the first
          // attempt even when permission is fine.
          await new Promise((r) => setTimeout(r, 140));
          await audio.play().catch(() => {
            if (reqId === reqIdRef.current) {
              // Reaching here means permission is genuinely refused rather
              // than merely un-primed, so say what the listener can do.
              setError("Tap play again to start audio");
              setPlaying(false);
            }
          });
        }
      } catch {
        if (reqId === reqIdRef.current) {
          setHasAudio(false);
          setPlaying(false);
          setError("No preview available");
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [current, hasAudio, unlockAudio]
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
      setError(null);
      audio.src = previewUrl;
      audio.load();
      currentUserId()
        .then((uid) => {
          if (uid) void recordListen(uid, display);
        })
        .catch(() => {});
      // playDirect is called with an already-resolved URL, so there's no fetch
      // in the way — but the element may still never have been primed if this
      // is the listener's first interaction with audio.
      audio.play().catch(async () => {
        await unlockAudio();
        await audio.play().catch(() => {
          setError("Tap play again to start audio");
          setPlaying(false);
        });
      });
    },
    [unlockAudio]
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
    setError(null);
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
        current, playing, loading, progress, elapsed, duration, hasAudio, shuffle, error,
        play, playDirect, toggle, toggleShuffle, stop, seek, setNextProvider, ensureGraph, getAnalyser,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
