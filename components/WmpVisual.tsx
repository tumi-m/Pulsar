"use client";

import { useEffect, useRef } from "react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";
import { AudioEngine } from "@/lib/audio-engine";
import { extractPalette, FALLBACK_PALETTE, type Palette } from "@/lib/palette";

export type WmpMode = "bars" | "waves" | "ambience";

/** Linear blend of two normalised RGB triples. */
const mixRgb = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  m: number
): [number, number, number] => [
  a[0] + (b[0] - a[0]) * m,
  a[1] + (b[1] - a[1]) * m,
  a[2] + (b[2] - a[2]) * m,
];

/**
 * Classic Windows-XP-era media-player visualiser — "Bars and Waves".
 *
 *   bars     — spectrum analyser: chunky segmented columns, rainbow gradient,
 *              falling peak caps and a mirrored floor reflection.
 *   waves    — oscilloscope: glowing multi-trace waveform on a grid.
 *   ambience — flowing plasma bands that pulse with the low end.
 *
 * Canvas 2D (cheap, universally supported). Reads the SHARED player analyser,
 * so it reacts to whatever is playing. Pauses when hidden and caps to ~30fps on
 * touch devices to stay easy on phone batteries.
 */
export function WmpVisual({
  release,
  mode,
  className = "",
}: {
  release: Release | null;
  mode: WmpMode;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const player = usePlayer();

  // Refs so the render loop never rebuilds on play/pause.
  const modeRef = useRef<WmpMode>(mode);
  const getAnalyserRef = useRef(player.getAnalyser);
  const playingRef = useRef(player.playing);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Album-art colours, so Bars/Waves/Ambience are tinted by the record itself
  // rather than a fixed scheme.
  const paletteRef = useRef<Palette>(FALLBACK_PALETTE);
  useEffect(() => {
    let cancelled = false;
    paletteRef.current = FALLBACK_PALETTE;
    if (!release?.artwork_url) return;
    extractPalette(release.artwork_url).then((p) => {
      if (!cancelled) paletteRef.current = p;
    });
    return () => {
      cancelled = true;
    };
  }, [release?.artwork_url]);
  useEffect(() => {
    getAnalyserRef.current = player.getAnalyser;
    playingRef.current = player.playing;
  }, [player.getAnalyser, player.playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const touch = window.matchMedia("(pointer: coarse)").matches;
    const DPR = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);

    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── analysis ──────────────────────────────────────
    // Shared engine: log-spaced bands, onset detection and auto-gain, plus
    // synthesised motion on touch devices where there is no analyser at all.
    const BANDS = touch ? 32 : 48;
    const engine = new AudioEngine({ bands: BANDS });
    const peaks = new Float32Array(BANDS); // falling peak caps
    let af = engine.update(null, 0.016, false);
    let t = 0;

    // ── drawing ───────────────────────────────────────
    const drawBars = () => {
      const pal = paletteRef.current;
      const floor = h * 0.68; // bars sit above a reflective "floor"
      const gap = Math.max(1, Math.round(w / BANDS / 7));
      const bw = (w - gap * (BANDS - 1)) / BANDS;
      const segH = Math.max(3, Math.round(h / 46)); // chunky XP-style segments

      for (let i = 0; i < BANDS; i++) {
        // The engine already applies fast-attack / slow-release smoothing.
        const v = Math.max(0, Math.min(1, af.bands[i]));
        peaks[i] = Math.max(peaks[i] - 0.006, v);

        const x = i * (bw + gap);
        const barH = v * floor;
        const segs = Math.max(0, Math.floor(barH / (segH + 2)));

        for (let s = 0; s < segs; s++) {
          const y = floor - (s + 1) * (segH + 2);
          const frac = s / Math.max(1, floor / (segH + 2));
          // Ramp the album's own two colours up the column, going white-hot at
          // the very top — the XP silhouette, re-coloured per record.
          const c = frac < 0.75
            ? mixRgb(pal.primary, pal.accent, frac / 0.75)
            : mixRgb(pal.accent, [1, 1, 1], (frac - 0.75) / 0.25);
          ctx.fillStyle = `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
          ctx.fillRect(x, y, bw, segH);
          // reflection below the floor, fading out
          ctx.globalAlpha = 0.16 * (1 - frac);
          ctx.fillRect(x, floor + (s + 1) * (segH + 2) - segH, bw, segH);
          ctx.globalAlpha = 1;
        }

        // peak cap
        const py = floor - peaks[i] * floor - segH;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(x, Math.max(0, py), bw, 2);
      }
    };

    const drawWaves = () => {
      const live = !af.isSynthetic;
      // faint grid, like an oscilloscope screen
      ctx.strokeStyle = "rgba(90,150,255,0.10)";
      ctx.lineWidth = 1;
      const step = Math.max(24, Math.round(w / 16));
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      const pal = paletteRef.current;
      const css = (c: [number, number, number]) =>
        `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
      const traces = [
        { c: css(pal.accent), off: 0, amp: 1 },
        { c: css(pal.primary), off: 0.14, amp: 0.72 },
        { c: css(mixRgb(pal.primary, pal.accent, 0.5)), off: 0.28, amp: 0.5 },
      ];
      const mid = h / 2;

      for (const tr of traces) {
        ctx.beginPath();
        ctx.strokeStyle = tr.c;
        ctx.lineWidth = 2;
        ctx.shadowColor = tr.c;
        ctx.shadowBlur = touch ? 0 : 10; // glow is costly on phones
        const N = touch ? 96 : 192;
        for (let i = 0; i <= N; i++) {
          const p = i / N;
          let v: number;
          if (live) {
            // Reconstruct a plausible waveform from the band energies: the
            // shared engine exposes spectrum, not time-domain samples.
            const b = af.bands[Math.floor(p * (af.bands.length - 1))];
            v = Math.sin(p * Math.PI * 12 + t * 6) * (0.25 + b * 1.5);
          } else {
            v = Math.sin(p * Math.PI * 4 + t * 2) * 0.25;
          }
          const y = mid + v * tr.amp * (h * 0.34) * Math.sin(Math.PI * p) +
            Math.sin(p * Math.PI * 2 + t + tr.off * 10) * 6;
          const x = p * w;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    const drawAmbience = () => {
      // Low-end drives the pulse; flowing translucent bands.
      const bass = af.bass;
      const pal = paletteRef.current;
      const bands = touch ? 5 : 8;
      for (let i = 0; i < bands; i++) {
        const p = i / bands;
        const c = mixRgb(pal.primary, pal.accent, (p + t * 0.06) % 1);
        ctx.fillStyle = `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${0.10 + bass * 0.18})`;
        ctx.beginPath();
        const amp = h * (0.10 + bass * 0.24);
        const yBase = h * (0.18 + p * 0.66);
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) {
          const y =
            yBase +
            Math.sin(x / (110 + i * 26) + t * (0.7 + p)) * amp +
            Math.sin(x / 47 - t * 1.2) * amp * 0.28;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }
    };

    const minFrameMs = touch ? 33 : 0;
    let last = 0;
    let lastFrame = 0;
    let running = false;

    const frame = (now?: number) => {
      if (document.hidden) {
        running = false;
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
      const ms = now ?? 0;
      if (minFrameMs && ms - last < minFrameMs) return;
      last = ms;
      t += 0.016;

      af = engine.update(getAnalyserRef.current?.() ?? null, ms > 0 ? Math.min(0.1, (ms - lastFrame) / 1000) : 0.016, playingRef.current);
      lastFrame = ms;
      t = af.time;

      // Dark backdrop with a subtle vignette — the XP player look.
      ctx.fillStyle = "#05060d";
      ctx.fillRect(0, 0, w, h);

      const m = modeRef.current;
      if (m === "bars") drawBars();
      else if (m === "waves") drawWaves();
      else drawAmbience();
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      last = 0;
      rafRef.current = requestAnimationFrame(frame);
    };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
        running = false;
      } else start();
    };
    document.addEventListener("visibilitychange", onVis);
    start();

    return () => {
      cancelAnimationFrame(rafRef.current);
      running = false;
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [release]);

  return <canvas ref={canvasRef} className={className} />;
}
