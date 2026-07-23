"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Release } from "@/lib/types";
import { usePlayer } from "./player/PlayerProvider";

export type VisualMode = "nebula" | "silhouette" | "aurora" | "crowd" | "art" | "video";

export const VISUAL_MODES: { id: VisualMode; label: string }[] = [
  { id: "nebula", label: "Nebula" },
  { id: "silhouette", label: "Silhouette" },
  { id: "aurora", label: "Aurora" },
  { id: "crowd", label: "Crowd" },
  { id: "art", label: "Cover" },
  { id: "video", label: "Video" },
];

interface Particle {
  hx: number; hy: number; hz: number;
  x: number; y: number; z: number;
  hue: number;
}

/**
 * The audio-reactive canvas (and YouTube "Video" mode), reading the SHARED
 * player analyser. Reused by the floating Visualizer and the inline visual
 * embedded in the album detail — so it never floats over / overlaps content.
 */
export function VisualCanvas({
  release,
  mode,
  className = "",
}: {
  release: Release | null;
  mode: VisualMode;
  className?: string;
}) {
  const player = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const artTargetsRef = useRef<{ x: number; y: number }[]>([]);
  const artImgRef = useRef<HTMLImageElement | null>(null);
  const modeRef = useRef<VisualMode>(mode);
  const rotRef = useRef(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<"idle" | "loading" | "none">("idle");

  const playing = player.playing;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    setVideoId(null);
    setVideoState("idle");
  }, [release]);

  // Resolve the YouTube video id the first time "Video" mode opens; pause the
  // 30s preview so its audio doesn't clash with the video.
  useEffect(() => {
    if (mode !== "video" || !release) return;
    if (player.playing) player.toggle();
    if (videoId || videoState === "loading" || videoState === "none") return;
    let cancelled = false;
    setVideoState("loading");
    (async () => {
      try {
        const res = await fetch(
          `/api/ytvideo?artist=${encodeURIComponent(release.artist)}&title=${encodeURIComponent(release.title)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.videoId) {
          setVideoId(data.videoId);
          setVideoState("idle");
        } else {
          setVideoState("none");
        }
      } catch {
        if (!cancelled) setVideoState("none");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, release]);

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

  const sampleArt = useCallback((artist: string, title: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      artImgRef.current = img;
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
    artImgRef.current = null;
    initParticles();
    sampleArt(release.artist, release.title);
  }, [release, initParticles, sampleArt]);

  // ── render loop ─────────────────────────────────────────────────
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

    const person = (
      x: number, y: number, s: number, hue: number, alpha: number, run: number
    ) => {
      const cyc = run * Math.PI * 2;
      const stride = Math.sin(cyc);
      const lift = Math.abs(Math.cos(cyc));
      const body = `hsla(${hue}, 78%, 58%, ${alpha})`;
      const hood = `hsla(${hue}, 55%, 42%, ${alpha})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.16);
      ctx.lineCap = "round";
      ctx.strokeStyle = body;
      ctx.fillStyle = body;
      ctx.lineWidth = s * 0.2;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(stride * s * 0.5, s * 1.05 - lift * s * 0.12);
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(-stride * s * 0.5, s * 1.05 - (1 - lift) * s * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.5);
      ctx.lineTo(s * 0.3, -s * 0.5);
      ctx.lineTo(s * 0.2, s * 0.55);
      ctx.lineTo(-s * 0.2, s * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.34);
      ctx.lineTo(-stride * s * 0.46, s * 0.12);
      ctx.moveTo(0, -s * 0.34);
      ctx.lineTo(stride * s * 0.46, -s * 0.08);
      ctx.stroke();
      ctx.fillStyle = hood;
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.48);
      ctx.quadraticCurveTo(-s * 0.46, -s * 1.18, s * 0.02, -s * 1.24);
      ctx.quadraticCurveTo(s * 0.46, -s * 1.16, s * 0.34, -s * 0.48);
      ctx.closePath();
      ctx.fill();
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

      // Punchier, more in-sync beat detection: lower threshold, higher gain,
      // faster decay so hits land on the beat instead of smearing.
      const rise = bass - prevBass;
      prevBass = bass;
      kick = Math.max(kick * 0.82, rise > 0.035 ? Math.min(1, rise * 7) : 0);

      ctx.fillStyle = "rgba(4,4,10,0.22)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      const m = modeRef.current;
      rotRef.current += 0.0016 + bass * 0.02;
      const rot = rotRef.current;

      if (m === "art") {
        const img = artImgRef.current;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(4,4,10,1)";
        ctx.fillRect(0, 0, W, H);
        if (img && img.width) {
          // React hard to the music: punch on the kick, sway + bob to the beat,
          // and a slight tilt so the cover really dances.
          const pulse = 1 + bass * 0.22 + kick * 0.3;
          const sway = Math.sin(time * 1.6) * (5 + level * 14) + kick * 10;
          const bob = Math.sin(time * 2.3) * (4 + bass * 12);
          const tilt = Math.sin(time * 0.9) * 0.02 + kick * 0.04;
          const side = Math.min(W, H) * 0.64 * pulse;
          ctx.save();
          ctx.translate(cx + sway, cy + bob);
          ctx.rotate(tilt);
          ctx.shadowColor = `hsla(${265 + treble * 80}, 90%, 60%, ${0.4 + kick * 0.5})`;
          ctx.shadowBlur = 40 + bass * 140 + kick * 120;
          ctx.fillStyle = "#000";
          ctx.fillRect(-side / 2, -side / 2, side, side);
          ctx.shadowBlur = 0;
          ctx.drawImage(img, -side / 2, -side / 2, side, side);
          ctx.strokeStyle = `hsla(0,0%,100%,${0.15 + treble * 0.3 + kick * 0.3})`;
          ctx.lineWidth = 1.5 + kick * 2;
          ctx.strokeRect(-side / 2, -side / 2, side, side);
          ctx.restore();
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
        const rows = 3;
        for (let r = rows - 1; r >= 0; r--) {
          const rowY = H * (0.6 + r * 0.13);
          const count = 11 + r * 5;
          const sizeF = 1 - r * 0.22;
          const baseHue = 250 + r * 26;
          const span = W + 90;
          const pace = (16 + r * 8) * (0.7 + bass * 1.6);
          const strideSpeed = 1.5 + bass * 2.4 + kick * 2.2;
          for (let i = 0; i < count; i++) {
            const phase = i * 1.7 + r * 3;
            const x = (((i / count) * span + time * pace) % span) - 45;
            const runCycle = ((time * strideSpeed + phase) % 1 + 1) % 1;
            const bob = Math.abs(Math.sin((time * strideSpeed + phase) * Math.PI)) * (7 * sizeF);
            const beatLift = (bass * 1.1 + kick * 2.2) * (18 * sizeF);
            const y = rowY - bob - beatLift;
            const hue = (baseHue + i * 5 + treble * 50) % 360;
            const alpha = (0.2 + level * 0.5) * (1 - r * 0.18);
            person(x, y, 26 * sizeF, hue, alpha, runCycle);
          }
        }
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

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {mode === "video" && (
        <div className="absolute inset-0 z-[6] bg-black">
          {videoId ? (
            <iframe
              key={videoId}
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={release ? `${release.title} — music video` : "music video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-star-white/45">
                {videoState === "none" ? "No music video found" : "Finding music video…"}
              </p>
              {videoState === "loading" && (
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon-violet" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
