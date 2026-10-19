"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { motion, AnimatePresence, useDragControls, useMotionValue } from "motion/react";
import { X, Play, Pause, ChevronLeft, ChevronRight, Move, Download, Share2 } from "lucide-react";
import type { Release } from "@/lib/types";
import type { ClipTake } from "@/lib/clipRecorder";
import { DUR, EASE, useReducedMotion } from "@/lib/motion";
import { playSfx } from "@/lib/sfx";
import { usePlayer } from "./player/PlayerProvider";
import { VisualCanvas, VISUAL_MODES, type VisualMode } from "./VisualCanvas";

interface VisualizerProps {
  release: Release | null;
  onClose: () => void;
}

/** Length of a saved clip. Long enough for a loop to read, short enough to share. */
const CLIP_SECONDS = 8;

/**
 * The clip recorder's states. Everything past idle is stamped with the record
 * it belongs to, so a finished clip of one album is never offered on another.
 */
type ClipState =
  | { kind: "idle" }
  | {
      kind: "recording";
      releaseId: string;
      head: string;
      /** False until the recorder has loaded and the sound tap has answered. */
      started: boolean;
      encoding: boolean;
      fraction: number;
      sound: boolean;
      note: string | null;
    }
  | ({ kind: "ready"; releaseId: string } & ClipTake)
  | { kind: "error"; releaseId: string; message: string };

const IDLE: ClipState = { kind: "idle" };

type ClipRecorder = typeof import("@/lib/clipRecorder");
// Mediabunny, the muxers and the whole take flow only arrive when a listener
// reaches for Record — the visualiser is mounted on the home page.
const loadClipRecorder = (): Promise<ClipRecorder> => import("@/lib/clipRecorder");

// Progress ring geometry for the 40px record key.
const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;

/**
 * What the floating panel's geometry depends on: the window's size, and the
 * root's clientWidth (the fixed panel's containing block, minus any scrollbar).
 */
export interface PanelViewport {
  innerWidth: number;
  innerHeight: number;
  clientWidth: number;
}

const readViewport = (): PanelViewport => ({
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  clientWidth: document.documentElement.clientWidth,
});

/** The panel's rendered width; its CSS is `min(w, 92vw)`. */
export function panelWidth(w: number, view: PanelViewport): number {
  return Math.min(w, view.innerWidth * 0.92);
}

/**
 * Drag bounds for the panel's x/y. It opens centred, so it may travel half the
 * free width each way and no further: an edge can meet the viewport's but not
 * cross it, so the close button (top right) can never be dragged out of reach.
 */
export function panelBounds(w: number, view: PanelViewport) {
  const slack = Math.max(0, (view.clientWidth - panelWidth(w, view)) / 2);
  return { top: -8, left: -slack, right: slack, bottom: Math.max(0, view.innerHeight - 220) };
}

/**
 * Size and x for a corner resize from `start` to the pointer. The panel is
 * centred, so widening it by Δ grows each side by Δ/2: the corner, and the
 * handle under the pointer, would drift off at half speed. Moving x by half the
 * growth pins the left edge instead, so the corner tracks the pointer the way a
 * window's does, and the right edge stops at the viewport.
 */
export function resizePanel(
  start: { px: number; py: number; w: number; h: number; x: number },
  px: number,
  py: number,
  view: PanelViewport
): { w: number; h: number; x: number } {
  const from = panelWidth(start.w, view);
  const left = (view.clientWidth - from) / 2 + start.x;
  const maxW = Math.min(view.innerWidth * 0.92, 1100, view.clientWidth - left);
  const maxH = Math.min(view.innerHeight - 120, 800);
  const w = Math.max(240, Math.min(maxW, from + (px - start.px)));
  const h = Math.max(170, Math.min(maxH, start.h + (py - start.py)));
  return { w, h, x: start.x + (panelWidth(w, view) - from) / 2 };
}

export function Visualizer({ release, onClose }: VisualizerProps) {
  const player = usePlayer();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<VisualMode>("video");
  const [detailOpen, setDetailOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [clipState, setClip] = useState<ClipState>(IDLE);
  const clipAbort = useRef<AbortController | null>(null);
  // Held once loaded so Save can call share() synchronously, inside the tap.
  const recorder = useRef<ClipRecorder | null>(null);
  // A clip (or an error about one) stamped for another record reads as idle.
  const clip: ClipState = clipState.kind !== "idle" && clipState.releaseId !== release?.id ? IDLE : clipState;
  const busy = clip.kind === "recording";
  // Free-floating panel the user can drag & resize.
  const [size, setSize] = useState({ w: 560, h: 340 });
  const resizeStart = useRef({ px: 0, py: 0, w: 0, h: 0, x: 0 });
  // Drag only from the title bar. Without this a swipe on the mode carousel
  // was captured as a panel drag (so the carousel couldn't be scrolled), and
  // the panel could be flung off-screen taking its close button with it.
  const dragControls = useDragControls();
  // The drag offset, held here so a resize can pin the left edge and so the
  // panel can be pulled back inside when the bounds shrink.
  const x = useMotionValue(0);
  // Computed on the client only (no `window` during SSR) and kept in step with
  // the panel's width and with resizes / orientation changes.
  const [bounds, setBounds] = useState({ top: 0, left: 0, right: 0, bottom: 0 });
  useEffect(() => {
    const sync = () => {
      const b = panelBounds(size.w, readViewport());
      setBounds(b);
      // dragConstraints only hold during a drag; a narrower window would
      // otherwise leave a dragged panel (and its close button) past the edge.
      x.set(Math.min(b.right, Math.max(b.left, x.get())));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [size.w, x]);

  const onResizeDown = (e: React.PointerEvent) => {
    // The first frame of a take fixes the clip's size; resizing mid-take would
    // only letterbox the rest of it.
    if (busy) return;
    e.stopPropagation();
    e.preventDefault();
    resizeStart.current = { px: e.clientX, py: e.clientY, w: size.w, h: size.h, x: x.get() };
    const move = (ev: PointerEvent) => {
      const next = resizePanel(resizeStart.current, ev.clientX, ev.clientY, readViewport());
      x.set(next.x);
      setSize({ w: next.w, h: next.h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    const onDetail = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", onDetail);
    return () => window.removeEventListener("pulsar-detail-open", onDetail);
  }, []);

  const cycleMode = (dir: 1 | -1) =>
    setMode((m) => {
      const i = VISUAL_MODES.findIndex((x) => x.id === m);
      const next = (i + dir + VISUAL_MODES.length) % VISUAL_MODES.length;
      return VISUAL_MODES[next].id;
    });

  const playing = player.playing;
  const hasAudio = player.hasAudio;
  const handleClose = useCallback(() => onClose(), [onClose]);
  // A take reads the player on every tick, long after the render that started it.
  const playerNow = useRef(player);
  useEffect(() => {
    playerNow.current = player;
  });

  // A take reads one record's canvas. Switching records, hiding the panel (the
  // album detail takes over) or unmounting removes that canvas, so end the take.
  const visible = !!release && !detailOpen;
  const releaseId = release?.id;
  useEffect(() => {
    return () => clipAbort.current?.abort();
  }, [releaseId, visible]);

  const startClip = async () => {
    if (!release || busy) return;
    const id = release.id;
    // Called inside the tap: builds the desktop analyser graph if this panel
    // was opened without one, so the clip can carry the preview's sound.
    // Returns null on touch devices, where the graph is never built.
    const analyser = player.ensureGraph();
    const ctrl = new AbortController();
    clipAbort.current = ctrl;
    setClip({ kind: "recording", releaseId: id, head: "Starting…", started: false, encoding: false, fraction: 0, sound: false, note: null });
    try {
      const rec = (recorder.current = await loadClipRecorder());
      const take = await rec.takeClip({
        canvas: panelRef.current?.querySelector("canvas") ?? null,
        analyser,
        preview: () => playerNow.current,
        title: release.title,
        seconds: CLIP_SECONDS,
        signal: ctrl.signal,
        onProgress: (p) => {
          if (clipAbort.current !== ctrl) return;
          setClip({ ...p, kind: "recording", releaseId: id, started: true, encoding: p.phase === "finalizing" });
        },
      });
      setClip({ kind: "ready", releaseId: id, ...take });
      playSfx("success");
    } catch (err) {
      if (ctrl.signal.aborted) {
        if (clipAbort.current === ctrl) setClip(IDLE);
        return;
      }
      const e = err as Error | null;
      setClip({
        kind: "error",
        releaseId: id,
        message:
          e?.name === "ClipRecorderError" ? e.message : "Couldn't load the recorder — check your connection and try again.",
      });
      playSfx("error");
    } finally {
      if (clipAbort.current === ctrl) clipAbort.current = null;
    }
  };

  // The LCD line under the title bar, plus what the clip will or won't
  // contain and why. The recorder words all of it: it reads the player and
  // the sound actually reaching the clip on every tick.
  const status =
    clip.kind === "idle"
      ? null
      : clip.kind === "error"
        ? { head: clip.message, sound: null, note: null }
        : {
            head: clip.head,
            sound: clip.kind === "recording" && !clip.started ? null : clip.sound,
            note: clip.note,
          };

  const recordKeyRef = useRef<HTMLButtonElement>(null);
  const activeModeRef = useRef<HTMLButtonElement>(null);
  // Discard and Dismiss unmount with the clip, and keyboard / screen-reader
  // focus would fall to <body>. Hand it to Record, where the next action is,
  // or to the active mode when Video mode hides the keys.
  const clearClip = () => {
    const hadFocus = !!panelRef.current?.contains(document.activeElement);
    flushSync(() => setClip(IDLE));
    if (hadFocus) (recordKeyRef.current ?? activeModeRef.current)?.focus();
  };
  const ringFraction = clip.kind === "recording" ? clip.fraction : 0;
  const showKeys = mode !== "video" || clip.kind !== "idle";
  // Glass shared by the transport keys.
  const keyGlass = {
    background: "rgba(255,255,255,0.14)",
    backdropFilter: "blur(10px) saturate(140%)",
    WebkitBackdropFilter: "blur(10px) saturate(140%)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.25)",
  } as const;

  // The album detail renders its own inline visual; the floating panel is only
  // for the standalone / expanded experience — draggable & resizable. It
  // reopens centred: the drag offset resets once the exit has played.
  return (
    <AnimatePresence onExitComplete={() => x.set(0)}>
      {release && !detailOpen && (
        <motion.div
          ref={panelRef}
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0.04}
          // Keep the panel inside the viewport so it can never be dragged out
          // of reach (taking its close button with it).
          dragConstraints={bounds}
          // Reduced motion: the panel arrives rather than travels.
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 30 }}
          transition={reduced ? { duration: DUR.instant } : { duration: 0.35, ease: EASE.out }}
          className="fixed left-1/2 top-16 z-40 transform-gpu overflow-hidden rounded-2xl border border-white/15 bg-[#12161a]/55 backdrop-blur-2xl"
          style={{
            x,
            width: `min(${size.w}px, 92vw)`,
            height: size.h,
            // Half the rendered width, which is min(w, 92vw). This was min(),
            // the larger offset: on a phone the panel opened ~100px off the
            // left edge, and on desktop it hugged the left instead of centring.
            // panelBounds and resizePanel are built on this centring.
            marginLeft: `max(${-size.w / 2}px, -46vw)`,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 10px rgba(0,0,0,0.4), 0 24px 60px rgba(0,0,0,0.6)",
          }}
        >
          <VisualCanvas release={release} mode={mode} className="absolute inset-0 h-full w-full" />

          {/* title bar. select-none: a drag that started on the label selected
              it, and the next press on that selection began a native text
              drag, which cancels the panel drag; the panel only moved once. */}
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="glass absolute inset-x-0 top-0 z-10 flex cursor-move select-none items-center justify-between gap-3 border-b border-white/10 px-3 py-2"
            style={{
              touchAction: "none",
              background: "rgba(255,255,255,0.08)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Move size={12} className="flex-shrink-0 text-ink/40" />
              <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-ink/45">
                Visualize
              </span>
              <span className="text-ink/25">·</span>
              <span className="truncate text-[12px] font-bold uppercase tracking-tight text-ink">
                {release.title}
              </span>
              <span className="hidden truncate text-[11px] text-ink/55 sm:inline">
                — {release.artist}
              </span>
            </div>
            <button
              onClick={handleClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close visualizer"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/25 text-ink/80 transition-colors hover:border-white/60 hover:text-ink"
              style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>

          {/* clip status — an LCD readout under the title bar. The clock ticks
              every second, so it is hidden from screen readers; the live
              region only speaks when the phase changes. */}
          <span className="sr-only" aria-live="polite">
            {clip.kind === "recording" ? (clip.encoding ? "Encoding clip" : "Recording clip") : status?.head}
            {status?.note ? `. ${status.note}` : ""}
          </span>
          {status && (
            <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-3">
              {/* CSS fade; the global prefers-reduced-motion rule makes it instant. */}
              <div
                key={clip.kind}
                aria-hidden
                className="pointer-events-auto flex max-w-full flex-col items-center gap-0.5 rounded-2xl border border-white/15 px-3 py-1.5 text-center duration-200 animate-in fade-in slide-in-from-top-1"
                style={{ background: "rgba(10,10,18,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
              >
                <span
                  className={`flex items-center gap-2 text-ink ${
                    clip.kind === "error"
                      ? "text-[11px] leading-snug"
                      : "font-mono text-[10px] font-bold uppercase tabular-nums tracking-[0.16em]"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${clip.kind === "ready" ? "bg-lcd" : "bg-vu"}`} />
                  {status.head}
                  {status.sound !== null && (
                    <span className={status.sound ? "text-lcd" : "text-ink/50"}>{status.sound ? "· Sound" : "· Silent"}</span>
                  )}
                </span>
                {status.note && <span className="text-[10px] leading-snug text-ink/60">{status.note}</span>}
              </div>
            </div>
          )}

          {/* bottom controls — a "watch-wheel" carousel of the 5 modes */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2.5 p-3 md:p-4">
            {/* max-w-full lets the wheel scroll instead of overflowing: on a
                phone the row was wider than the panel and, centred, clipped
                the chevrons and the first modes off both edges. */}
            <div className="flex max-w-full items-center gap-1">
              {/* Modes are locked during a take: switching between the GPU and
                  canvas engines swaps the canvas element being captured. */}
              <button
                onClick={() => cycleMode(-1)}
                disabled={busy}
                aria-label="Previous visualisation"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink/60 hover:bg-white/10 hover:text-ink disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              {/* macOS-style segmented wheel: active pill centred & raised,
                  neighbours scaled down / faded like a rotary picker */}
              <div
                className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border border-white/15 p-1"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(14px) saturate(160%)",
                  WebkitBackdropFilter: "blur(14px) saturate(160%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 6px rgba(0,0,0,0.4), 0 6px 18px rgba(0,0,0,0.4)",
                }}
              >
                {VISUAL_MODES.map((mo) => {
                  const active = mo.id === mode;
                  return (
                    <button
                      key={mo.id}
                      ref={active ? activeModeRef : undefined}
                      onClick={() => setMode(mo.id)}
                      disabled={busy && !active}
                      className={`flex-shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-all duration-200 disabled:opacity-30 ${
                        active
                          ? "scale-105 bg-white text-deck shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                          : "scale-90 text-ink/45 hover:text-ink"
                      }`}
                    >
                      {mo.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => cycleMode(1)}
                disabled={busy}
                aria-label="Next visualisation"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink/60 hover:bg-white/10 hover:text-ink disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {showKeys && (
              <div className="flex items-center gap-3">
                {/* Left slot balances the record key so play stays centred; it
                    holds Discard once a clip is waiting to be saved. */}
                {clip.kind === "ready" || clip.kind === "error" ? (
                  <button
                    onClick={clearClip}
                    aria-label={clip.kind === "ready" ? "Discard clip" : "Dismiss"}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-ink/70 ring-1 ring-white/25 transition-transform hover:text-ink active:scale-95"
                    style={keyGlass}
                  >
                    <X size={15} strokeWidth={2.5} />
                  </button>
                ) : (
                  <span className="h-10 w-10" aria-hidden />
                )}
                {mode !== "video" && (
                  <button
                    onClick={() => player.toggle()}
                    disabled={!hasAudio}
                    aria-label={playing ? "Pause" : "Play"}
                    className="flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-white/40 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                    style={keyGlass}
                  >
                    {playing ? (
                      <Pause size={20} className="text-white drop-shadow" fill="currentColor" />
                    ) : (
                      <Play size={20} className="ml-0.5 text-white drop-shadow" fill="currentColor" />
                    )}
                  </button>
                )}
                {clip.kind === "ready" ? (
                  <button
                    onClick={() => void recorder.current?.saveClipFile(clip.file, clip.canShare)}
                    aria-label={clip.canShare ? "Share clip" : "Save clip"}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-lcd ring-2 ring-lcd/70 transition-transform hover:scale-105 active:scale-95"
                    style={keyGlass}
                  >
                    {clip.canShare ? <Share2 size={16} strokeWidth={2.5} /> : <Download size={16} strokeWidth={2.5} />}
                  </button>
                ) : busy ? (
                  <button
                    onClick={() => clipAbort.current?.abort()}
                    aria-label="Cancel recording"
                    className="relative flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
                    style={keyGlass}
                  >
                    {/* Determinate: it fills with the take and never spins,
                        so reduced motion only loses the easing between ticks
                        (the global prefers-reduced-motion rule). */}
                    <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
                      <circle cx="20" cy="20" r={RING_R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.5" />
                      <circle
                        cx="20"
                        cy="20"
                        r={RING_R}
                        fill="none"
                        stroke="rgb(var(--vu-red-rgb))"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={RING_C}
                        strokeDashoffset={RING_C * (1 - ringFraction)}
                        className="transition-[stroke-dashoffset] duration-100 ease-linear"
                      />
                    </svg>
                    <span className="h-3 w-3 rounded-[3px] bg-white" aria-hidden />
                  </button>
                ) : mode !== "video" ? (
                  <button
                    ref={recordKeyRef}
                    onClick={startClip}
                    // Fetch the recorder while the pointer is on its way down.
                    onPointerEnter={() => void loadClipRecorder().catch(() => {})}
                    aria-label={`Record clip (${CLIP_SECONDS} seconds)`}
                    title="Record clip"
                    className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-white/40 transition-transform hover:scale-105 active:scale-95"
                    style={keyGlass}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full bg-vu"
                      style={{ boxShadow: "0 0 10px rgb(var(--vu-red-rgb) / 0.8)" }}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* resize handle (bottom-right corner) */}
          <div
            onPointerDown={onResizeDown}
            className={`absolute bottom-0 right-0 z-20 flex h-6 w-6 cursor-se-resize items-end justify-end p-1 text-white/45 hover:text-white/80 ${
              busy ? "pointer-events-none opacity-0" : ""
            }`}
            aria-label="Resize"
            title="Drag to resize"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M11 4L4 11M11 8l-3 3" />
            </svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
