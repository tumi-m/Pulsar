"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Release } from "@/lib/types";
import { Artwork } from "./Artwork";

interface Props {
  done: number;
  total: number;
  label: string;
  color: string;
  /** The release currently being matched — drives the artwork animation. */
  current?: Release | null;
  /** Recently matched releases, newest first — they stack up as it works. */
  recent?: Release[];
  Icon?: () => React.ReactElement;
}

/**
 * The "building your playlist" moment. This is the payoff of the whole export
 * flow and it can run for a minute on a big crate, so it's built to be watched:
 * a spinning record cut from the album art, concentric pulses in the service's
 * colour, covers flying onto a stack as each one matches, and a live equaliser.
 *
 * Everything is transform/opacity only (compositor-friendly) and collapses to a
 * calm static card under `prefers-reduced-motion`.
 */
export function PlaylistBuildOverlay({
  done,
  total,
  label,
  color,
  current,
  recent = [],
  Icon,
}: Props) {
  const reduce = useReducedMotion();
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(4,4,10,0.88)", backdropFilter: "blur(18px)" }}
    >
      {/* colour wash that breathes with the service's brand colour */}
      {!reduce && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(60% 45% at 50% 45%, ${color}26, transparent 70%)`,
          }}
          animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.08, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <motion.div
        initial={{ scale: 0.92, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="relative w-[min(92vw,400px)] overflow-hidden rounded-3xl border p-7 text-center"
        style={{
          borderColor: `${color}40`,
          background: "linear-gradient(165deg, rgba(20,20,30,0.96), rgba(8,8,14,0.98))",
          boxShadow: `0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.10), 0 0 60px ${color}1a`,
        }}
      >
        {/* light sweep across the card */}
        {!reduce && (
          <motion.span
            className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }}
            animate={{ x: ["-60%", "380%"] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* ── the record ─────────────────────────────── */}
        <div className="relative mx-auto mb-6 h-32 w-32">
          {/* concentric pulses */}
          {!reduce &&
            [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-0 rounded-full border"
                style={{ borderColor: `${color}55` }}
                animate={{ scale: [1, 1.65], opacity: [0.55, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
              />
            ))}

          {/* spinning disc with the current cover as its label */}
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{
              background: "repeating-radial-gradient(circle at center, #16161c 0 2px, #0d0d12 2px 4px)",
              boxShadow: `inset 0 0 30px rgba(0,0,0,0.9), 0 10px 30px rgba(0,0,0,0.6), 0 0 24px ${color}33`,
            }}
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          >
            <div className="absolute inset-[26%] overflow-hidden rounded-full ring-1 ring-white/15">
              <AnimatePresence mode="popLayout">
                {current ? (
                  <motion.div
                    key={current.id}
                    initial={{ opacity: 0, scale: 1.15 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0"
                  >
                    <Artwork
                      src={current.artwork_url}
                      artist={current.artist}
                      title={current.title}
                      sizes="80px"
                    />
                  </motion.div>
                ) : (
                  <div className="absolute inset-0" style={{ backgroundColor: color }} />
                )}
              </AnimatePresence>
            </div>
            {/* spindle hole */}
            <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#05050a] ring-1 ring-white/20" />
          </motion.div>

          {/* service badge riding the edge of the record */}
          <span
            className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-[#0b0b12]"
            style={{ backgroundColor: color, color: "#04040a" }}
          >
            {Icon ? <Icon /> : null}
          </span>
        </div>

        {/* ── covers flying onto the stack ────────────── */}
        {recent.length > 0 && (
          <div className="mb-5 flex h-10 items-center justify-center gap-1.5">
            <AnimatePresence initial={false} mode="popLayout">
              {recent.slice(0, 6).map((r, i) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -26, scale: 0.5, rotate: -25 }}
                  animate={{
                    opacity: 1 - i * 0.14,
                    y: 0,
                    scale: 1 - i * 0.06,
                    rotate: 0,
                  }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md ring-1 ring-white/15"
                >
                  <Artwork src={r.artwork_url} artist={r.artist} title={r.title} sizes="36px" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="text-sm font-bold uppercase tracking-[0.22em] text-star-white">
          Building your playlist
        </p>

        {/* now-matching line */}
        <div className="mt-1.5 h-4 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={current?.id ?? done}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="truncate text-[11px] text-star-white/55"
            >
              {current ? `${current.artist} — ${current.title}` : `Matching on ${label}…`}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* ── progress ───────────────────────────────── */}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between px-0.5">
            <span className="font-mono text-[11px] tabular-nums text-star-white/45">
              {done} / {total}
            </span>
            <motion.span
              key={pct}
              initial={{ scale: 1.25, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className="font-mono text-[13px] font-bold tabular-nums"
              style={{ color }}
            >
              {pct}%
            </motion.span>
          </div>

          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: `linear-gradient(90deg, ${color}, #ffffff)` }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
            />
            {/* shimmer riding the filled portion */}
            {!reduce && (
              <motion.span
                className="absolute inset-y-0 w-16"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }}
                animate={{ x: ["-64px", "420px"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>
        </div>

        {/* ── equaliser ──────────────────────────────── */}
        {!reduce && (
          <div className="mt-5 flex items-end justify-center gap-[3px]" aria-hidden>
            {Array.from({ length: 13 }).map((_, i) => (
              <motion.span
                key={i}
                className="w-[3px] rounded-full"
                style={{ backgroundColor: color, opacity: 0.75 }}
                animate={{ height: [4, 6 + ((i * 7) % 17), 4] }}
                transition={{
                  duration: 0.7 + (i % 4) * 0.16,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.06,
                }}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-star-white/25">
          Keep this tab open
        </p>
      </motion.div>
    </motion.div>
  );
}
