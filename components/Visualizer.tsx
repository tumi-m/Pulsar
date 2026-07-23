"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, ChevronLeft, ChevronRight, Move } from "lucide-react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";
import { VisualCanvas, VISUAL_MODES, type VisualMode } from "./VisualCanvas";

interface VisualizerProps {
  release: Release | null;
  onClose: () => void;
}

export function Visualizer({ release, onClose }: VisualizerProps) {
  const player = usePlayer();
  const [mode, setMode] = useState<VisualMode>("nebula");
  const [detailOpen, setDetailOpen] = useState(false);
  // Free-floating panel the user can drag & resize.
  const [size, setSize] = useState({ w: 560, h: 340 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    const move = (ev: PointerEvent) => {
      const maxW = Math.min(window.innerWidth - 24, 1100);
      const maxH = Math.min(window.innerHeight - 120, 800);
      setSize({
        w: Math.max(240, Math.min(maxW, resizeStart.current.w + (ev.clientX - resizeStart.current.x))),
        h: Math.max(170, Math.min(maxH, resizeStart.current.h + (ev.clientY - resizeStart.current.y))),
      });
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

  // The album detail renders its own inline visual; the floating panel is only
  // for the standalone / expanded experience — draggable & resizable.
  return (
    <AnimatePresence>
      {release && !detailOpen && (
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.04}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-1/2 top-16 z-40 transform-gpu overflow-hidden rounded-2xl border border-white/15 bg-[#0a0a14]/55 backdrop-blur-2xl"
          style={{
            width: `min(${size.w}px, 92vw)`,
            height: size.h,
            marginLeft: `min(${-size.w / 2}px, -46vw)`,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 10px rgba(0,0,0,0.4), 0 24px 60px rgba(0,0,0,0.6)",
          }}
        >
          <VisualCanvas release={release} mode={mode} className="absolute inset-0 h-full w-full" />

          {/* title bar */}
          <div
            className="absolute inset-x-0 top-0 z-10 flex cursor-move items-center justify-between gap-3 border-b border-white/10 px-3 py-2"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px) saturate(150%)",
              WebkitBackdropFilter: "blur(12px) saturate(150%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Move size={12} className="flex-shrink-0 text-star-white/40" />
              <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-star-white/45">
                Visualize
              </span>
              <span className="text-star-white/25">·</span>
              <span className="truncate text-[12px] font-bold uppercase tracking-tight text-star-white">
                {release.title}
              </span>
              <span className="hidden truncate text-[11px] text-star-white/55 sm:inline">
                — {release.artist}
              </span>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close visualizer"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/25 text-star-white/80 transition-colors hover:border-white/60 hover:text-star-white"
              style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>

          {/* bottom controls — a "watch-wheel" carousel of the 5 modes */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2.5 p-3 md:p-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() => cycleMode(-1)}
                aria-label="Previous visualisation"
                className="flex h-7 w-7 items-center justify-center rounded-full text-star-white/60 hover:bg-white/10 hover:text-star-white"
              >
                <ChevronLeft size={16} />
              </button>
              {/* macOS-style segmented wheel: active pill centred & raised,
                  neighbours scaled down / faded like a rotary picker */}
              <div
                className="scrollbar-none flex items-center gap-0.5 overflow-x-auto rounded-full border border-white/15 p-1"
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
                      onClick={() => setMode(mo.id)}
                      className={`flex-shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-all duration-200 ${
                        active
                          ? "scale-105 bg-white text-void shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                          : "scale-90 text-star-white/45 hover:text-star-white"
                      }`}
                    >
                      {mo.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => cycleMode(1)}
                aria-label="Next visualisation"
                className="flex h-7 w-7 items-center justify-center rounded-full text-star-white/60 hover:bg-white/10 hover:text-star-white"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {mode !== "video" && (
              <button
                onClick={() => player.toggle()}
                disabled={!hasAudio}
                aria-label={playing ? "Pause" : "Play"}
                className="flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-white/40 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                style={{
                  background: "rgba(255,255,255,0.14)",
                  backdropFilter: "blur(10px) saturate(140%)",
                  WebkitBackdropFilter: "blur(10px) saturate(140%)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.25)",
                }}
              >
                {playing ? (
                  <Pause size={20} className="text-white drop-shadow" fill="currentColor" />
                ) : (
                  <Play size={20} className="ml-0.5 text-white drop-shadow" fill="currentColor" />
                )}
              </button>
            )}
          </div>

          {/* resize handle (bottom-right corner) */}
          <div
            onPointerDown={onResizeDown}
            className="absolute bottom-0 right-0 z-20 flex h-6 w-6 cursor-se-resize items-end justify-end p-1 text-white/45 hover:text-white/80"
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
