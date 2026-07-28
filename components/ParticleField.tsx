"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

const PARTICLE_COLORS = [
  "rgba(0, 212, 255,",   // neon-blue
  "rgba(255, 0, 128,",   // neon-pink
  "rgba(155, 93, 229,",  // neon-violet
  "rgba(0, 255, 136,",   // neon-green
  "rgba(232, 232, 244,", // star-white
];

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Users who prefer reduced motion get a calm, static backdrop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Touch devices are typically lower-powered and have no cursor: fewer
    // particles, no mouse-gravity, no O(n²) connecting lines, and a 30fps cap.
    const touch = window.matchMedia("(pointer: coarse)").matches;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Init particles — far fewer on phones.
    const PARTICLE_COUNT = touch
      ? Math.min(40, Math.floor(window.innerWidth / 18))
      : Math.min(120, Math.floor(window.innerWidth / 12));
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3 - 0.1,
      radius: Math.random() * 1.5 + 0.3,
      alpha: Math.random() * 0.6 + 0.1,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
    }));

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    if (!touch) window.addEventListener("mousemove", handleMouseMove);

    const minFrameMs = touch ? 33 : 0; // ~30fps on mobile, uncapped on desktop
    let last = 0;
    let running = false;

    const animate = (t?: number) => {
      // Stop cleanly when hidden — `start()` is the only way back in, so two
      // loops can never run at once (which would double CPU/battery).
      if (document.hidden) {
        running = false;
        return;
      }
      animRef.current = requestAnimationFrame(animate);
      const now = t ?? 0;
      if (minFrameMs && now - last < minFrameMs) return;
      last = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const p of particles) {
        if (!touch) {
          // Gentle gravity toward the cursor (desktop only).
          const dx = mx - p.x;
          const dy = my - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200 && dist > 0) {
            const force = ((200 - dist) / 200) * 0.0015;
            p.vx += dx * force;
            p.vy += dy * force;
          }
        }

        p.vy -= 0.0005; // drift upward
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -5) p.x = canvas.width + 5;
        if (p.x > canvas.width + 5) p.x = -5;
        if (p.y < -5) p.y = canvas.height + 5;
        if (p.y > canvas.height + 5) p.y = -5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();
      }

      // Connecting lines are O(n²); skip them on touch devices.
      if (!touch) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 80) {
              const alpha = (1 - dist / 80) * 0.12;
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(155, 93, 229, ${alpha})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }
    };

    // Single entry point: never schedules a second concurrent loop.
    const start = () => {
      if (running || document.hidden) return;
      running = true;
      last = 0;
      animRef.current = requestAnimationFrame(animate);
    };

    // Pause entirely while the tab/page is hidden (saves battery on mobile).
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animRef.current);
        running = false;
      } else {
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      cancelAnimationFrame(animRef.current);
      running = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.7 }}
    />
  );
}
