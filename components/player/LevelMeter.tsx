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
  segments = 0,
  className = "",
  color = "currentColor",
}: {
  playing: boolean;
  getAnalyser: () => AnalyserNode | null;
  bars?: number;
  /**
   * 0 draws continuous bars in `color`. Any other value draws each bar as a
   * ladder of that many LED segments, coloured by POSITION rather than level —
   * green through the body, yellow near the top, red for the last step — which
   * is how a deck's VU ladder reads: you learn where red is, and the music
   * reaches it or doesn't. Unlit segments stay faintly visible, as a dark LED
   * does, so the scale is legible at rest.
   */
  segments?: number;
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

    // Canvas can't read CSS custom properties, so resolve the palette once.
    const root = getComputedStyle(document.documentElement);
    const tone = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
    const LED = {
      low: tone("--lcd-green", "#7ed9ae"),
      high: tone("--sport-yellow", "#ffce0a"),
      peak: tone("--vu-red", "#e23b2e"),
    };
    const ledFor = (k: number, n: number) => {
      const f = (k + 1) / n;
      return f > 0.86 ? LED.peak : f > 0.62 ? LED.high : LED.low;
    };
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

      // A breakpoint-hidden instance (the bar mounts one meter per layout) is
      // display:none — skip the analyser read and the paint entirely.
      if (canvas.offsetParent === null) return;

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

        const x = i * (barW + gap);

        if (segments > 0) {
          const segGap = Math.max(1, Math.round(dpr));
          const segH = Math.max(1, (h - segGap * (segments - 1)) / segments);
          const lit = Math.round(heights[i] * segments);
          for (let k = 0; k < segments; k++) {
            const y = h - (k + 1) * segH - k * segGap;
            ctx.globalAlpha = k < lit ? 1 : 0.14;
            ctx.fillStyle = ledFor(k, segments);
            ctx.fillRect(x, y, barW, segH);
          }
          ctx.globalAlpha = 1;
          continue;
        }

        const barH = Math.max(dpr, heights[i] * h);
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
  }, [bars, segments, color, getAnalyser, reduced]);

  if (reduced && segments > 0) {
    // Static ladder: the scale without the motion — green body, yellow, red.
    return (
      <span aria-hidden="true" className={`flex items-end gap-[2px] ${className}`}>
        {Array.from({ length: bars }, (_, i) => (
          <span key={i} className="flex h-full flex-1 flex-col-reverse gap-px">
            {Array.from({ length: segments }, (_, k) => {
              const f = (k + 1) / segments;
              const bg = f > 0.86 ? "var(--vu-red)" : f > 0.62 ? "var(--sport-yellow)" : "var(--lcd-green)";
              return <span key={k} className="flex-1" style={{ background: bg, opacity: k < 2 ? 0.8 : 0.14 }} />;
            })}
          </span>
        ))}
      </span>
    );
  }

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
