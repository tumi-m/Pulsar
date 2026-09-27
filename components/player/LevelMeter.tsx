"use client";

import { useEffect, useRef } from "react";
import { AudioEngine } from "@/lib/audio-engine";
import { useReducedMotion } from "@/lib/motion";

/**
 * A live level meter for the transport bar.
 *
 * Pulsar is a music app whose UI never once moved in time with the music. This
 * is the smallest honest fix: a strip of bars driven by the real analyser where
 * one exists, and by AudioEngine's synthesised motion where it doesn't — which
 * is every touch device, because routing the <audio> element through an
 * AudioContext broke mobile playback and the graph is deliberately desktop-only.
 *
 * Drawn on a canvas and driven by rAF, so the bars move without React
 * re-rendering anything. A 4×/sec context update was already found to re-render
 * every tile during playback; this must not add to that.
 *
 * `title` says which signal is being shown, because synthesised motion that
 * claims to be a spectrum is a small lie told sixty times a second.
 */
export function LevelMeter({
  playing,
  getAnalyser,
  bars = 5,
  className = "",
  color = "currentColor",
}: {
  playing: boolean;
  getAnalyser: () => AnalyserNode | null;
  bars?: number;
  className?: string;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  // Read in the loop without re-subscribing it every render.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const syntheticRef = useRef(true);

  useEffect(() => {
    // Motion that exists purely as decoration is exactly what someone asking
    // for reduced motion wants gone. Render one static bar row instead.
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const engine = new AudioEngine({ bands: bars });
    let raf = 0;
    let stopped = false;
    // Held so a paused meter settles to rest rather than freezing mid-jump.
    const heights = new Float32Array(bars);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();

    // The engine wants a real delta so motion is frame-rate independent —
    // passing a constant makes it run at different speeds on a 120Hz display.
    let last = performance.now();

    const draw = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(draw);

      const dt = (now - last) / 1000;
      last = now;

      const analyser = getAnalyser();
      const frame = engine.update(analyser, dt, playingRef.current);
      syntheticRef.current = frame.isSynthetic;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const gap = Math.max(1, Math.round(dpr));
      const barW = Math.max(1, (w - gap * (bars - 1)) / bars);

      for (let i = 0; i < bars; i++) {
        // Bands run low→high; a touch of the kick keeps the whole row breathing
        // on the beat rather than only the bass bar moving.
        const band = frame.bands[i] ?? 0;
        const target = playingRef.current
          ? Math.min(1, band * 0.85 + frame.kick * 0.25 + 0.06)
          : 0.06;
        // Asymmetric smoothing: jump to peaks, fall away gently. Without this
        // the meter looks like noise rather than like music.
        const prev = heights[i];
        heights[i] = target > prev ? prev + (target - prev) * 0.55 : prev + (target - prev) * 0.12;

        const barH = Math.max(dpr, heights[i] * h);
        const x = i * (barW + gap);
        const y = h - barH;
        ctx.fillStyle = color;
        // Rounded caps read as a meter; square ones read as a chart.
        const r = Math.min(barW / 2, dpr * 1.5);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, r);
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [bars, color, getAnalyser, reduced]);

  if (reduced) {
    // Static equivalent: same footprint, no movement.
    return (
      <span
        aria-hidden="true"
        className={`flex items-end gap-[2px] ${className}`}
        style={{ color }}
      >
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className="w-[2px] rounded-full bg-current"
            style={{ height: `${30 + (i % 3) * 18}%`, opacity: 0.6 }}
          />
        ))}
      </span>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      // Not a measurement on touch devices — say so rather than implying one.
      title={syntheticRef.current ? "Playback indicator" : "Live audio level"}
    />
  );
}
