"use client";

import { useEffect, useRef } from "react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";

export type WmpMode = "bars" | "waves" | "ambience";

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

    // ── analyser buffers ──────────────────────────────
    const BANDS = touch ? 32 : 48;
    const peaks = new Float32Array(BANDS); // falling peak caps
    const levels = new Float32Array(BANDS); // smoothed bar heights
    let freq: Uint8Array<ArrayBuffer> | null = null;
    let wave: Uint8Array<ArrayBuffer> | null = null;
    let t = 0;

    // Idle animation when nothing is playing, so it never looks broken.
    const idleAt = (i: number, time: number) =>
      0.10 + 0.09 * (Math.sin(time * 1.6 + i * 0.45) * 0.5 + 0.5);

    const readAudio = () => {
      const analyser = getAnalyserRef.current?.();
      if (!analyser || !playingRef.current) return false;
      if (!freq || freq.length !== analyser.frequencyBinCount) {
        freq = new Uint8Array(analyser.frequencyBinCount);
        wave = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(wave!);
      return true;
    };

    // Map FFT bins onto BANDS with a log-ish curve (bass gets fewer bins).
    const bandValue = (i: number): number => {
      if (!freq) return 0;
      const n = freq.length;
      const lo = Math.floor(Math.pow(i / BANDS, 1.65) * n * 0.72);
      const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / BANDS, 1.65) * n * 0.72));
      let sum = 0;
      for (let k = lo; k < hi && k < n; k++) sum += freq[k];
      return sum / (hi - lo) / 255;
    };

    // ── drawing ───────────────────────────────────────
    const drawBars = (live: boolean) => {
      const floor = h * 0.68; // bars sit above a reflective "floor"
      const gap = Math.max(1, Math.round(w / BANDS / 7));
      const bw = (w - gap * (BANDS - 1)) / BANDS;
      const segH = Math.max(3, Math.round(h / 46)); // chunky XP-style segments

      for (let i = 0; i < BANDS; i++) {
        const target = live ? bandValue(i) : idleAt(i, t);
        // Fast attack, slow release — the classic analyser feel.
        levels[i] += (target - levels[i]) * (target > levels[i] ? 0.55 : 0.13);
        const v = Math.max(0, Math.min(1, levels[i]));

        peaks[i] = Math.max(peaks[i] - 0.006, v);

        const x = i * (bw + gap);
        const barH = v * floor;
        const segs = Math.max(0, Math.floor(barH / (segH + 2)));

        for (let s = 0; s < segs; s++) {
          const y = floor - (s + 1) * (segH + 2);
          const frac = s / Math.max(1, floor / (segH + 2));
          // green → yellow → red, exactly like the old analysers
          const hue = 120 - frac * 120;
          ctx.fillStyle = `hsl(${hue}, 95%, ${52 + frac * 8}%)`;
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

    const drawWaves = (live: boolean) => {
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

      const traces = [
        { c: "#00e5ff", off: 0, amp: 1 },
        { c: "#9b5de5", off: 0.14, amp: 0.72 },
        { c: "#ff5fa2", off: 0.28, amp: 0.5 },
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
          if (live && wave) {
            const idx = Math.floor(p * (wave.length - 1));
            v = (wave[idx] - 128) / 128;
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

    const drawAmbience = (live: boolean) => {
      // Low-end drives the pulse; flowing translucent bands.
      let bass = 0;
      if (live && freq) {
        for (let i = 0; i < 12 && i < freq.length; i++) bass += freq[i];
        bass = bass / 12 / 255;
      } else {
        bass = 0.25 + Math.sin(t * 1.5) * 0.12;
      }
      const bands = touch ? 5 : 8;
      for (let i = 0; i < bands; i++) {
        const p = i / bands;
        const hue = (p * 300 + t * 22) % 360;
        ctx.fillStyle = `hsla(${hue}, 90%, 58%, ${0.10 + bass * 0.16})`;
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

      const live = readAudio();

      // Dark backdrop with a subtle vignette — the XP player look.
      ctx.fillStyle = "#05060d";
      ctx.fillRect(0, 0, w, h);

      const m = modeRef.current;
      if (m === "bars") drawBars(live);
      else if (m === "waves") drawWaves(live);
      else drawAmbience(live);
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
