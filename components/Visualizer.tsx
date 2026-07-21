"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, Sparkles, Repeat } from "lucide-react";
import type { Release } from "@/lib/types";

interface VisualizerProps {
  release: Release | null;
  onClose: () => void;
}

type Mode = "nebula" | "silhouette" | "aurora";
const MODES: { id: Mode; label: string }[] = [
  { id: "nebula", label: "Nebula" },
  { id: "silhouette", label: "Silhouette" },
  { id: "aurora", label: "Aurora" },
];

interface Particle {
  // home position on a unit sphere (nebula) or art target (silhouette)
  hx: number; hy: number; hz: number;
  // live position
  x: number; y: number; z: number;
  hue: number;
}

export function Visualizer({ release, onClose }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const artTargetsRef = useRef<{ x: number; y: number }[]>([]);
  const modeRef = useRef<Mode>("nebula");
  const rotRef = useRef(0);

  const [mode, setMode] = useState<Mode>("nebula");
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "none">("loading");
  const [trackName, setTrackName] = useState<string>("");
  const [loop, setLoop] = useState(true); // repeat the preview so visuals never stop

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // keep the audio element's loop flag in sync with the toggle
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loop;
  }, [loop]);

  // ── init particles ──────────────────────────────────────────────
  const initParticles = useCallback(() => {
    const COUNT = Math.min(1400, Math.floor((window.innerWidth * window.innerHeight) / 900));
    const ps: Particle[] = [];
    for (let i = 0; i < COUNT; i++) {
      // even distribution on a sphere (golden spiral)
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

  // ── sample album art into silhouette targets (same-origin proxy) ─
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
        return; // tainted — skip silhouette
      }
      const targets: { x: number; y: number }[] = [];
      for (let y = 0; y < S; y += 2) {
        for (let x = 0; x < S; x += 2) {
          const idx = (y * S + x) * 4;
          const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
          // keep the brighter pixels — forms the lit silhouette
          if (lum > 0.32 && Math.random() < 0.7) {
            targets.push({ x: (x / S) * 2 - 1, y: (y / S) * 2 - 1 });
          }
        }
      }
      artTargetsRef.current = targets;
    };
    img.src = `/api/artwork?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
  }, []);

  // ── fetch preview + wire Web Audio ──────────────────────────────
  useEffect(() => {
    if (!release) return;
    setStatus("loading");
    setPlaying(false);
    initParticles();
    sampleArt(release.artist, release.title);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/preview?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}`
        );
        if (!res.ok) throw new Error("no preview");
        const data = await res.json();
        if (cancelled) return;
        setTrackName(data.track ?? release.title);
        const audio = audioRef.current;
        if (audio) {
          audio.crossOrigin = "anonymous";
          audio.loop = loop;
          audio.src = data.previewUrl;
          audio.load();
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("none");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [release, initParticles, sampleArt]);

  // ── audio graph + play/pause ────────────────────────────────────
  const ensureGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
    }
    return ctxRef.current;
  }, []);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || status !== "ready") return;
    const ctx = ensureGraph();
    if (ctx?.state === "suspended") await ctx.resume();
    if (audio.paused) {
      await audio.play().catch(() => {});
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [ensureGraph, status]);

  // auto-play once ready
  useEffect(() => {
    if (status === "ready") togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── render loop ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const freq = new Uint8Array(256);

    const draw = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const cx = W / 2;
      const cy = H / 2;

      // audio bands (or gentle idle sim if not playing)
      let bass = 0.12, mid = 0.1, treble = 0.08, level = 0.1;
      const analyser = analyserRef.current;
      if (analyser && playing) {
        analyser.getByteFrequencyData(freq);
        const n = freq.length;
        const avg = (a: number, b: number) => {
          let s = 0;
          const lo = Math.floor(n * a), hi = Math.floor(n * b);
          for (let i = lo; i < hi; i++) s += freq[i];
          return s / ((hi - lo) * 255);
        };
        bass = avg(0, 0.08);
        mid = avg(0.08, 0.35);
        treble = avg(0.35, 1);
        level = avg(0, 1);
      } else {
        const t = performance.now() / 1000;
        bass = 0.12 + Math.sin(t * 1.5) * 0.05;
        treble = 0.08 + Math.sin(t * 3) * 0.03;
        level = 0.1;
      }

      // fade trail
      ctx.fillStyle = "rgba(4,4,10,0.22)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      const m = modeRef.current;
      rotRef.current += 0.0016 + bass * 0.02;
      const rot = rotRef.current;

      if (m === "aurora") {
        // radial spectrum corona
        const bins = 96;
        const baseR = Math.min(W, H) * 0.16;
        for (let i = 0; i < bins; i++) {
          const mag = analyser && playing ? freq[Math.floor((i / bins) * 200)] / 255 : 0.15 + Math.sin(i + rot * 6) * 0.1;
          const a = (i / bins) * Math.PI * 2 + rot;
          const len = baseR + mag * Math.min(W, H) * 0.32;
          const x1 = cx + Math.cos(a) * baseR;
          const y1 = cy + Math.sin(a) * baseR;
          const x2 = cx + Math.cos(a) * len;
          const y2 = cy + Math.sin(a) * len;
          const hue = (i * 3 + rot * 60 + 200) % 360;
          ctx.strokeStyle = `hsla(${hue}, 90%, ${45 + mag * 35}%, ${0.35 + mag * 0.5})`;
          ctx.lineWidth = 2 + mag * 3;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      } else {
        // particle field (nebula or silhouette)
        const ps = particlesRef.current;
        const targets = artTargetsRef.current;
        const useArt = m === "silhouette" && targets.length > 0;
        const scale = Math.min(W, H) * (useArt ? 0.34 : 0.3) * (1 + bass * 0.5);
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        const burst = 1 + bass * bass * 2.2; // beat push

        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          let tx: number, ty: number, tz: number;
          if (useArt) {
            const t = targets[i % targets.length];
            tx = t.x * burst;
            ty = t.y * burst;
            tz = Math.sin(i * 0.5 + rot) * 0.2;
          } else {
            // rotate home sphere around Y then X
            const rx = p.hx * cosR - p.hz * sinR;
            const rz = p.hx * sinR + p.hz * cosR;
            tx = rx * (1 + treble * 0.4);
            ty = p.hy * (1 + treble * 0.4);
            tz = rz;
          }
          // ease
          p.x += (tx - p.x) * 0.12;
          p.y += (ty - p.y) * 0.12;
          p.z += (tz - p.z) * 0.12;

          // perspective project
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

      // central bloom
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * (0.2 + bass * 0.3));
      glow.addColorStop(0, `hsla(265, 80%, 60%, ${0.05 + level * 0.12})`);
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
    };
  }, [playing]);

  // ── cleanup on close ────────────────────────────────────────────
  useEffect(() => {
    if (release) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [release]);

  const handleClose = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      {release && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[70] bg-void"
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} onEnded={() => setPlaying(false)} />

          {/* top bar */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5 md:p-8">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-star-white/40">
                “Now Visualizing”
              </p>
              <h2 className="mt-1 text-xl font-bold uppercase tracking-tight text-star-white md:text-3xl">
                {release.title}
              </h2>
              <p className="text-sm text-star-white/60">{release.artist}</p>
              {status === "none" && (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neon-amber/70">
                  No preview found · idle visual
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              aria-label="Close visualizer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-void/50 text-star-white/70 backdrop-blur transition-colors hover:border-white/60 hover:text-star-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* bottom controls — WMP-inspired */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 p-6 md:p-10">
            {/* mode switch */}
            <div
              className="flex items-center gap-0.5 rounded-full p-1"
              style={{
                background: "linear-gradient(160deg, rgba(40,40,50,0.7), rgba(15,15,22,0.7))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.5)",
                backdropFilter: "blur(8px)",
              }}
            >
              {MODES.map((mo) => (
                <button
                  key={mo.id}
                  onClick={() => setMode(mo.id)}
                  className={`rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                    mode === mo.id ? "bg-star-white text-void" : "text-star-white/55 hover:text-star-white"
                  }`}
                >
                  {mo.label}
                </button>
              ))}
            </div>

            {/* transport */}
            <div className="flex items-center gap-4">
              {/* loop toggle */}
              <button
                onClick={() => setLoop((v) => !v)}
                aria-label={loop ? "Loop on" : "Loop off"}
                aria-pressed={loop}
                title={loop ? "Looping preview" : "Play once"}
                className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                  loop
                    ? "border-neon-violet/60 bg-neon-violet/20 text-neon-violet"
                    : "border-white/15 bg-void/50 text-star-white/45 hover:text-star-white"
                }`}
              >
                <Repeat size={16} />
              </button>

              {/* play / pause */}
              <button
                onClick={togglePlay}
                disabled={status !== "ready"}
                aria-label={playing ? "Pause" : "Play"}
                className="flex h-16 w-16 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                style={{
                  background: "linear-gradient(160deg, #f0f0f4, #c4c4cc)",
                  boxShadow: "0 8px 24px rgba(155,93,229,0.4), inset 0 1px 0 rgba(255,255,255,0.7)",
                }}
              >
                {status === "loading" ? (
                  <Sparkles size={22} className="animate-pulse text-void" />
                ) : playing ? (
                  <Pause size={24} className="text-void" fill="currentColor" />
                ) : (
                  <Play size={24} className="ml-0.5 text-void" fill="currentColor" />
                )}
              </button>

              {/* spacer to keep play button visually centered */}
              <span className="h-11 w-11" aria-hidden />
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-star-white/35">
              {status === "ready"
                ? `30s preview${loop ? " · looping" : ""} · ${trackName}`
                : status === "loading"
                ? "finding preview…"
                : "no audio"}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
