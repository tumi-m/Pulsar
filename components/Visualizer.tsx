"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause } from "lucide-react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";

interface VisualizerProps {
  release: Release | null;
  onClose: () => void;
}

type Mode = "nebula" | "silhouette" | "aurora" | "crowd";
const MODES: { id: Mode; label: string }[] = [
  { id: "nebula", label: "Nebula" },
  { id: "silhouette", label: "Silhouette" },
  { id: "aurora", label: "Aurora" },
  { id: "crowd", label: "Crowd" },
];

interface Particle {
  hx: number; hy: number; hz: number;
  x: number; y: number; z: number;
  hue: number;
}

export function Visualizer({ release, onClose }: VisualizerProps) {
  const player = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const artTargetsRef = useRef<{ x: number; y: number }[]>([]);
  const modeRef = useRef<Mode>("nebula");
  const rotRef = useRef(0);
  const [mode, setMode] = useState<Mode>("nebula");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const playing = player.playing;

  // ── init particles ──────────────────────────────────────────────
  const initParticles = useCallback(() => {
    const COUNT = Math.min(1200, Math.floor((window.innerWidth * window.innerHeight) / 1100));
    const ps: Particle[] = [];
    for (let i = 0; i < COUNT; i++) {
      const t = i / COUNT;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      ps.push({
        hx: Math.sin(phi) * Math.cos(theta),
        hy: Math.sin(phi) * Math.sin(theta),
        hz: Math.cos(phi),
        x: 0, y: 0, z: 0,
        hue: (t * 320 + 200) % 360,
      });
    }
    particlesRef.current = ps;
  }, []);

  // ── sample album art into silhouette targets ────────────────────
  const sampleArt = useCallback((artist: string, title: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const S = 108;
      const off = document.createElement("canvas");
      off.width = S; off.height = S;
      const octx = off.getContext("2d");
      if (!octx) return;
      octx.drawImage(img, 0, 0, S, S);
      let data: Uint8ClampedArray;
      try {
        data = octx.getImageData(0, 0, S, S).data;
      } catch {
        return;
      }
      const targets: { x: number; y: number }[] = [];
      for (let y = 0; y < S; y += 2) {
        for (let x = 0; x < S; x += 2) {
          const idx = (y * S + x) * 4;
          const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
          if (lum > 0.32 && Math.random() < 0.7) {
            targets.push({ x: (x / S) * 2 - 1, y: (y / S) * 2 - 1 });
          }
        }
      }
      artTargetsRef.current = targets;
    };
    img.src = `/api/artwork?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
  }, []);

  useEffect(() => {
    if (!release) return;
    initParticles();
    sampleArt(release.artist, release.title);
  }, [release, initParticles, sampleArt]);

  // ── render loop (reads the SHARED player analyser) ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const freq = new Uint8Array(1024);
    let prevBass = 0;
    let kick = 0;

    // draw one glowing dancer silhouette
    const person = (
      x: number, y: number, s: number, hue: number, alpha: number, armsUp: number
    ) => {
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${alpha})`;
      // head
      ctx.beginPath();
      ctx.arc(x, y - s, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
      // torso
      ctx.beginPath();
      ctx.moveTo(x - s * 0.28, y - s * 0.55);
      ctx.lineTo(x + s * 0.28, y - s * 0.55);
      ctx.lineTo(x + s * 0.18, y + s * 0.5);
      ctx.lineTo(x - s * 0.18, y + s * 0.5);
      ctx.closePath();
      ctx.fill();
      // arms — raise with the beat
      const ay = y - s * 0.4 - armsUp * s * 0.7;
      ctx.lineWidth = s * 0.16;
      ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - s * 0.24, y - s * 0.4);
      ctx.lineTo(x - s * 0.5, ay);
      ctx.moveTo(x + s * 0.24, y - s * 0.4);
      ctx.lineTo(x + s * 0.5, ay);
      ctx.stroke();
      // legs
      ctx.beginPath();
      ctx.moveTo(x - s * 0.1, y + s * 0.5);
      ctx.lineTo(x - s * 0.22, y + s * 1.05);
      ctx.moveTo(x + s * 0.1, y + s * 0.5);
      ctx.lineTo(x + s * 0.22, y + s * 1.05);
      ctx.stroke();
    };

    const draw = () => {
      const W = canvas.clientWidth || window.innerWidth;
      const H = canvas.clientHeight || window.innerHeight;
      const cx = W / 2;
      const cy = H / 2;
      const time = performance.now() / 1000;

      let bass = 0.12, treble = 0.08, level = 0.1;
      const analyser = player.getAnalyser();
      if (analyser && playing) {
        analyser.getByteFrequencyData(freq);
        const n = analyser.frequencyBinCount;
        const avg = (a: number, b: number) => {
          let s = 0;
          const lo = Math.floor(n * a), hi = Math.floor(n * b);
          for (let i = lo; i < hi; i++) s += freq[i];
          return s / ((hi - lo) * 255);
        };
        bass = avg(0, 0.06);
        treble = avg(0.3, 1);
        level = avg(0, 1);
      } else {
        bass = 0.12 + Math.sin(time * 1.5) * 0.05;
        treble = 0.08 + Math.sin(time * 3) * 0.03;
        level = 0.1;
      }

      const rise = bass - prevBass;
      prevBass = bass;
      kick = Math.max(kick * 0.86, rise > 0.05 ? Math.min(1, rise * 5) : 0);

      ctx.fillStyle = "rgba(4,4,10,0.22)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      const m = modeRef.current;
      rotRef.current += 0.0016 + bass * 0.02;
      const rot = rotRef.current;

      if (m === "crowd") {
        // rows of glowing dancers jumping to the beat (depth = parallax)
        const rows = 3;
        for (let r = rows - 1; r >= 0; r--) {
          const rowY = H * (0.58 + r * 0.14);
          const count = 12 + r * 6;
          const sizeF = 1 - r * 0.24;
          const baseHue = 250 + r * 30;
          for (let i = 0; i < count; i++) {
            const x = ((i + 0.5) / count) * W + Math.sin(i * 3 + r) * 10;
            const phase = i * 1.3 + r * 2;
            const jumpAmt = 0.35 + bass * 1.4 + kick * 2.4;
            const jump = jumpAmt * (26 * sizeF) * Math.abs(Math.sin(time * 4 + phase));
            const y = rowY - jump;
            const hue = (baseHue + i * 6 + treble * 60) % 360;
            const alpha = (0.18 + level * 0.5) * (1 - r * 0.2);
            const armsUp = Math.min(1, bass * 1.5 + kick * 1.5);
            person(x, y, 26 * sizeF, hue, alpha, armsUp);
          }
        }
        // floor shimmer
        const floor = ctx.createLinearGradient(0, H * 0.85, 0, H);
        floor.addColorStop(0, `hsla(280, 90%, 60%, ${0.04 + kick * 0.1})`);
        floor.addColorStop(1, "transparent");
        ctx.fillStyle = floor;
        ctx.fillRect(0, H * 0.85, W, H * 0.15);
      } else if (m === "aurora") {
        const bins = 96;
        const baseR = Math.min(W, H) * 0.16;
        for (let i = 0; i < bins; i++) {
          const mag = analyser && playing ? freq[Math.floor((i / bins) * 200)] / 255 : 0.15 + Math.sin(i + rot * 6) * 0.1;
          const a = (i / bins) * Math.PI * 2 + rot;
          const len = baseR + mag * Math.min(W, H) * 0.32;
          const hue = (i * 3 + rot * 60 + 200) % 360;
          ctx.strokeStyle = `hsla(${hue}, 90%, ${45 + mag * 35}%, ${0.35 + mag * 0.5})`;
          ctx.lineWidth = 2 + mag * 3;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * baseR, cy + Math.sin(a) * baseR);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
        }
      } else {
        const ps = particlesRef.current;
        const targets = artTargetsRef.current;
        const useArt = m === "silhouette" && targets.length > 0;
        const scale = Math.min(W, H) * (useArt ? 0.34 : 0.3) * (1 + bass * 0.6 + kick * 0.5);
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        const burst = 1 + bass * 0.8 + kick * 1.4;

        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          let tx: number, ty: number, tz: number;
          if (useArt) {
            const t = targets[i % targets.length];
            tx = t.x * burst; ty = t.y * burst; tz = Math.sin(i * 0.5 + rot) * 0.2;
          } else {
            const rx = p.hx * cosR - p.hz * sinR;
            const rz = p.hx * sinR + p.hz * cosR;
            tx = rx * (1 + treble * 0.4); ty = p.hy * (1 + treble * 0.4); tz = rz;
          }
          const follow = 0.24 + kick * 0.35;
          p.x += (tx - p.x) * follow;
          p.y += (ty - p.y) * follow;
          p.z += (tz - p.z) * follow;
          const persp = 1.8 / (1.8 - p.z);
          const sx = cx + p.x * scale * persp;
          const sy = cy + p.y * scale * persp;
          const depth = (p.z + 1) / 2;
          const size = (useArt ? 1.2 : 0.8 + depth * 1.8) * persp;
          const hue = (p.hue + rot * 40 + level * 60) % 360;
          const alpha = (0.25 + depth * 0.6) * (0.5 + level);
          ctx.fillStyle = `hsla(${hue}, 85%, ${55 + treble * 30}%, ${alpha})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * (0.2 + bass * 0.3 + kick * 0.25));
      glow.addColorStop(0, `hsla(265, 90%, 65%, ${0.06 + level * 0.14 + kick * 0.15})`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = "source-over";
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [playing, player]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  const hasAudio = player.hasAudio;

  return (
    <AnimatePresence>
      {release && (
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
          className="fixed inset-x-2 top-16 z-40 h-[56vh] transform-gpu touch-none overflow-hidden rounded-2xl border border-star-white/12 bg-void shadow-2xl md:inset-x-4"
        >
          <div className="absolute left-1/2 top-2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-star-white/25" />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

          {/* top bar */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 md:p-6">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-star-white/40">
                Now Visualizing
              </p>
              <h2 className="mt-1 truncate text-lg font-bold uppercase tracking-tight text-star-white md:text-2xl">
                {release.title}
              </h2>
              <p className="truncate text-sm text-star-white/60">{release.artist}</p>
              {!hasAudio && (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neon-amber/70">
                  No preview · idle visual
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              aria-label="Close visualizer"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-star-white/20 bg-void/50 text-star-white/70 backdrop-blur transition-colors hover:border-white/60 hover:text-star-white"
            >
              <X size={16} />
            </button>
          </div>

          {/* bottom controls */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 md:p-6">
            <div className="scrollbar-none flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-[#141420]/70 p-1 backdrop-blur">
              {MODES.map((mo) => (
                <button
                  key={mo.id}
                  onClick={() => setMode(mo.id)}
                  className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                    mode === mo.id ? "bg-star-white text-void" : "text-star-white/55 hover:text-star-white"
                  }`}
                >
                  {mo.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => player.toggle()}
              disabled={!hasAudio}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{ background: "linear-gradient(160deg, #f0f0f4, #c4c4cc)" }}
            >
              {playing ? (
                <Pause size={22} className="text-void" fill="currentColor" />
              ) : (
                <Play size={22} className="ml-0.5 text-void" fill="currentColor" />
              )}
            </button>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-star-white/30">
              Swipe down to close · keep browsing below
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
