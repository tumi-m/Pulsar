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

type Mode = "nebula" | "silhouette" | "aurora" | "crowd" | "art";
const MODES: { id: Mode; label: string }[] = [
  { id: "nebula", label: "Nebula" },
  { id: "silhouette", label: "Silhouette" },
  { id: "aurora", label: "Aurora" },
  { id: "crowd", label: "Crowd" },
  { id: "art", label: "Cover" },
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
  const artImgRef = useRef<HTMLImageElement | null>(null);
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
      artImgRef.current = img; // keep the full image for the "Cover" mode
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
    artImgRef.current = null; // drop the previous cover until the new one loads
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

    // Draw one glowing HOODED RUNNER — an NPC-style figure mid-stride, like
    // the crowd of running silhouettes in a stylized music video. `run` is a
    // 0..1 phase driving the stride/arm-swing cycle.
    const person = (
      x: number, y: number, s: number, hue: number, alpha: number, run: number
    ) => {
      const cyc = run * Math.PI * 2;
      const stride = Math.sin(cyc);          // legs/arms swing
      const lift = Math.abs(Math.cos(cyc));  // foot lift on the up-phase
      const body = `hsla(${hue}, 78%, 58%, ${alpha})`;
      const hood = `hsla(${hue}, 55%, 42%, ${alpha})`;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.16); // forward running lean
      ctx.lineCap = "round";
      ctx.strokeStyle = body;
      ctx.fillStyle = body;

      // legs — one drives forward, one trails back
      ctx.lineWidth = s * 0.2;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(stride * s * 0.5, s * 1.05 - lift * s * 0.12);
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(-stride * s * 0.5, s * 1.05 - (1 - lift) * s * 0.12);
      ctx.stroke();

      // torso — the hoodie body
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.5);
      ctx.lineTo(s * 0.3, -s * 0.5);
      ctx.lineTo(s * 0.2, s * 0.55);
      ctx.lineTo(-s * 0.2, s * 0.55);
      ctx.closePath();
      ctx.fill();

      // arms — swing opposite the legs, bent forward
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.34);
      ctx.lineTo(-stride * s * 0.46, s * 0.12);
      ctx.moveTo(0, -s * 0.34);
      ctx.lineTo(stride * s * 0.46, -s * 0.08);
      ctx.stroke();

      // hood — a raised, pointed cowl over the head
      ctx.fillStyle = hood;
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.48);
      ctx.quadraticCurveTo(-s * 0.46, -s * 1.18, s * 0.02, -s * 1.24);
      ctx.quadraticCurveTo(s * 0.46, -s * 1.16, s * 0.34, -s * 0.48);
      ctx.closePath();
      ctx.fill();

      // face — shadowed inside the hood
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -s * 0.82, s * 0.24, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
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

      if (m === "art") {
        // Just the album / single artwork — softly breathing with the beat.
        const img = artImgRef.current;
        ctx.globalCompositeOperation = "source-over";
        // clear to a near-black so the cover reads cleanly (no additive trails)
        ctx.fillStyle = "rgba(4,4,10,1)";
        ctx.fillRect(0, 0, W, H);
        if (img && img.width) {
          const pulse = 1 + bass * 0.06 + kick * 0.05;
          const side = Math.min(W, H) * 0.72 * pulse;
          const x = cx - side / 2;
          const y = cy - side / 2;
          // outer glow that pulses on the low end
          ctx.save();
          ctx.shadowColor = `hsla(265, 90%, 60%, ${0.4 + kick * 0.4})`;
          ctx.shadowBlur = 40 + bass * 80 + kick * 60;
          ctx.fillStyle = "#000";
          ctx.fillRect(x, y, side, side);
          ctx.restore();
          ctx.drawImage(img, x, y, side, side);
          // subtle vignette frame
          ctx.strokeStyle = `hsla(0,0%,100%,${0.12 + treble * 0.2})`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, side, side);
        } else {
          ctx.fillStyle = "hsla(0,0%,100%,0.3)";
          ctx.font = "600 12px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText("LOADING COVER…", cx, cy);
        }
        ctx.globalCompositeOperation = "source-over";
        rafRef.current = requestAnimationFrame(draw);
        return;
      } else if (m === "crowd") {
        // rows of hooded NPCs RUNNING across the floor (depth = parallax).
        // The whole crowd drifts sideways so it reads as a running horde; the
        // beat drives their stride speed and a jump-lift on each kick.
        const rows = 3;
        for (let r = rows - 1; r >= 0; r--) {
          const rowY = H * (0.6 + r * 0.13);
          const count = 11 + r * 5;
          const sizeF = 1 - r * 0.22;
          const baseHue = 250 + r * 26;
          const span = W + 90;
          // pace: faster rows in front, everyone speeds up on the low end
          const pace = (16 + r * 8) * (0.7 + bass * 1.6);
          const strideSpeed = 1.5 + bass * 2.4 + kick * 2.2;
          for (let i = 0; i < count; i++) {
            const phase = i * 1.7 + r * 3;
            // horizontal running motion — wraps around the screen
            const x = (((i / count) * span + time * pace) % span) - 45;
            const runCycle = ((time * strideSpeed + phase) % 1 + 1) % 1;
            // running bob + a jump-lift that pops on the beat
            const bob = Math.abs(Math.sin((time * strideSpeed + phase) * Math.PI)) * (7 * sizeF);
            const beatLift = (bass * 1.1 + kick * 2.2) * (18 * sizeF);
            const y = rowY - bob - beatLift;
            const hue = (baseHue + i * 5 + treble * 50) % 360;
            const alpha = (0.2 + level * 0.5) * (1 - r * 0.18);
            person(x, y, 26 * sizeF, hue, alpha, runCycle);
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
          className="fixed inset-x-3 top-16 z-40 h-[48vh] transform-gpu touch-none overflow-hidden rounded-[3px] border-2 border-[#42424e] bg-void md:inset-x-[20%]"
          style={{
            boxShadow:
              "inset 2px 2px 0 rgba(255,255,255,0.22), inset -2px -2px 0 rgba(0,0,0,0.7), 0 22px 60px rgba(0,0,0,0.6)",
          }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

          {/* NeXT-style scored title bar */}
          <div
            className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b-2 border-[#08080c] px-2.5 py-2"
            style={{
              backgroundColor: "#22222c",
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 3px)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.6)",
            }}
          >
            <div className="min-w-0 flex items-center gap-2 rounded-[2px] bg-[#1a1a22]/80 px-2 py-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-star-white/45">
                Visualize
              </span>
              <span className="text-star-white/25">·</span>
              <span className="truncate font-mono text-[11px] font-bold uppercase tracking-tight text-star-white">
                {release.title}
              </span>
              <span className="hidden truncate font-mono text-[11px] text-star-white/55 sm:inline">
                — {release.artist}
              </span>
              {!hasAudio && (
                <span className="flex-shrink-0 font-mono text-[9px] font-bold uppercase tracking-widest text-neon-amber/70">
                  idle
                </span>
              )}
            </div>
            <button
              onClick={handleClose}
              aria-label="Close visualizer"
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[2px] border border-[#5a5a66] bg-[#2c2c36] text-star-white/80 transition-colors hover:bg-[#3a3a46] hover:text-star-white"
              style={{ boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.22), inset -1px -1px 0 rgba(0,0,0,0.6)" }}
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>

          {/* bottom controls */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 md:p-6">
            <div
              className="scrollbar-none flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[3px] border border-[#4a4a56] p-1"
              style={{
                backgroundColor: "#20202a",
                boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.18), inset -1px -1px 0 rgba(0,0,0,0.6)",
              }}
            >
              {MODES.map((mo) => (
                <button
                  key={mo.id}
                  onClick={() => setMode(mo.id)}
                  className={`flex-shrink-0 rounded-[2px] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                    mode === mo.id ? "text-void" : "text-star-white/60 hover:text-star-white"
                  }`}
                  style={
                    mode === mo.id
                      ? {
                          background: "linear-gradient(160deg, #f0f0f4, #c8c8d0)",
                          boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.6), inset -1px -1px 0 rgba(0,0,0,0.35)",
                        }
                      : undefined
                  }
                >
                  {mo.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => player.toggle()}
              disabled={!hasAudio}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-14 w-14 items-center justify-center rounded-[4px] transition-transform active:translate-y-px disabled:opacity-40"
              style={{
                background: "linear-gradient(160deg, #f0f0f4, #c4c4cc)",
                boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.7), inset -2px -2px 0 rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.5)",
              }}
            >
              {playing ? (
                <Pause size={22} className="text-void" fill="currentColor" />
              ) : (
                <Play size={22} className="ml-0.5 text-void" fill="currentColor" />
              )}
            </button>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-star-white/30">
              Swipe down to close · keep browsing below
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
