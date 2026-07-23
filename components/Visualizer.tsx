"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [dock, setDock] = useState<"full" | "mini">("full");
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (release) setDock("full");
  }, [release]);

  useEffect(() => {
    const onMenu = () => setDock((d) => (d === "mini" ? "full" : "mini"));
    const onDetail = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-toggle-sidebar", onMenu);
    window.addEventListener("pulsar-detail-open", onDetail);
    return () => {
      window.removeEventListener("pulsar-toggle-sidebar", onMenu);
      window.removeEventListener("pulsar-detail-open", onDetail);
    };
  }, []);

  const cycleMode = (dir: 1 | -1) =>
    setMode((m) => {
      const i = VISUAL_MODES.findIndex((x) => x.id === m);
      const next = (i + dir + VISUAL_MODES.length) % VISUAL_MODES.length;
      return VISUAL_MODES[next].id;
    });

  // Full centered, or the 20%-right "mini" when the main menu is opened.
  const dockClass =
    dock === "mini"
      ? "right-3 top-16 h-[24vh] w-[42%] md:w-[20%]"
      : "inset-x-6 top-16 h-[34vh] md:inset-x-[24%]";

  const playing = player.playing;
  const hasAudio = player.hasAudio;
  const handleClose = useCallback(() => onClose(), [onClose]);

  // The album detail renders its own inline visual; the floating panel is only
  // for the standalone / expanded experience.
  return (
    <AnimatePresence>
      {release && !detailOpen && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.05, bottom: 0.6 }}
          onDragEnd={(_e, info) => {
            if (info.offset.y > 110 || info.velocity.y > 600) handleClose();
          }}
          className={`fixed z-40 transform-gpu touch-none overflow-hidden rounded-2xl border border-white/15 bg-[#0a0a14]/55 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${dockClass}`}
          style={{
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 10px rgba(0,0,0,0.4), 0 24px 60px rgba(0,0,0,0.6)",
          }}
        >
          <VisualCanvas release={release} mode={mode} className="absolute inset-0 h-full w-full" />

          {/* title bar */}
          <div
            className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px) saturate(150%)",
              WebkitBackdropFilter: "blur(12px) saturate(150%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
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

          {/* bottom controls — mode switcher with prev/next arrows + play */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2.5 p-3 md:p-4">
            {dock !== "mini" && (
              <div
                className="flex max-w-full items-center gap-1 rounded-full border border-white/15 p-1"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  backdropFilter: "blur(12px) saturate(150%)",
                  WebkitBackdropFilter: "blur(12px) saturate(150%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 6px 18px rgba(0,0,0,0.4)",
                }}
              >
                <button
                  onClick={() => cycleMode(-1)}
                  aria-label="Previous visualisation"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-star-white/70 hover:bg-white/10 hover:text-star-white"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="min-w-[68px] text-center text-[11px] font-bold uppercase tracking-[0.14em] text-star-white">
                  {VISUAL_MODES.find((m) => m.id === mode)?.label}
                </span>
                <button
                  onClick={() => cycleMode(1)}
                  aria-label="Next visualisation"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-star-white/70 hover:bg-white/10 hover:text-star-white"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
            {mode !== "video" && (
              <button
                onClick={() => player.toggle()}
                disabled={!hasAudio}
                aria-label={playing ? "Pause" : "Play"}
                className={`flex items-center justify-center rounded-full ring-1 ring-white/40 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 ${
                  dock === "mini" ? "h-9 w-9" : "h-12 w-12"
                }`}
                style={{
                  background: "rgba(255,255,255,0.14)",
                  backdropFilter: "blur(10px) saturate(140%)",
                  WebkitBackdropFilter: "blur(10px) saturate(140%)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.25)",
                }}
              >
                {playing ? (
                  <Pause size={dock === "mini" ? 15 : 20} className="text-white drop-shadow" fill="currentColor" />
                ) : (
                  <Play size={dock === "mini" ? 15 : 20} className="ml-0.5 text-white drop-shadow" fill="currentColor" />
                )}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
