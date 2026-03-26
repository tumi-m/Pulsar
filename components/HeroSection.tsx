"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import type { Release } from "@/lib/types";
import { MOOD_COLORS } from "@/lib/utils";

interface HeroSectionProps {
  featured: Release | null;
  totalToday: number;
}

export function HeroSection({ featured, totalToday }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroY = useTransform(scrollY, [0, 400], [0, 80]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const mood = featured?.mood ?? "ambient";
  const moodStyle = MOOD_COLORS[mood] ?? MOOD_COLORS.ambient;

  return (
    <motion.section
      ref={containerRef}
      style={{ opacity: heroOpacity, y: heroY }}
      className="relative flex flex-col items-center justify-center min-h-[70vh] text-center px-6"
    >
      {/* Wordmark */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="mb-8"
      >
        <div className="relative inline-block">
          <h1
            className="text-[72px] md:text-[96px] lg:text-[128px] font-bold tracking-tighter leading-none text-transparent bg-clip-text select-none"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #e8e8f4 0%, #9b5de5 50%, #00d4ff 100%)",
              WebkitBackgroundClip: "text",
            }}
          >
            PULSAR
          </h1>
          {/* Subtitle pulse ring */}
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full border border-neon-violet/20 pointer-events-none"
            style={{ transform: "scale(1.1)" }}
          />
        </div>
        <p className="mt-3 text-dust text-sm font-mono tracking-[0.3em] uppercase">
          Daily music discovery
        </p>
      </motion.div>

      {/* Stats */}
      {mounted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="flex items-center gap-6 mb-10"
        >
          <div className="text-center">
            <div className={`text-3xl font-bold ${moodStyle.text}`}>
              {totalToday}
            </div>
            <div className="text-[10px] font-mono text-dust/60 tracking-widest mt-1">
              NEW TODAY
            </div>
          </div>
          <div className="w-px h-10 bg-mist/30" />
          <div className="text-center">
            <div className="text-3xl font-bold text-star-white/60">5</div>
            <div className="text-[10px] font-mono text-dust/60 tracking-widest mt-1">
              PLATFORMS
            </div>
          </div>
          <div className="w-px h-10 bg-mist/30" />
          <div className="text-center">
            <div className="text-3xl font-bold text-star-white/60">
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
            </div>
            <div className="text-[10px] font-mono text-dust/60 tracking-widest mt-1">
              {new Date().getFullYear()}
            </div>
          </div>
        </motion.div>
      )}

      {/* Featured release card (if available) */}
      {featured && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative w-full max-w-sm mx-auto"
        >
          <div
            className={`absolute -inset-6 rounded-3xl pointer-events-none blur-2xl opacity-30 ${moodStyle.bg}`}
          />
          <div className="relative rounded-2xl overflow-hidden border border-mist/20 shadow-2xl">
            <div className="relative aspect-square">
              <Image
                src={featured.artwork_url}
                alt={`${featured.artist} — ${featured.title}`}
                fill
                sizes="400px"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className={`text-[10px] font-mono font-bold tracking-widest mb-1 ${moodStyle.text}`}>
                  FEATURED — TODAY
                </p>
                <p className="text-star-white font-bold text-lg leading-tight">
                  {featured.title}
                </p>
                <p className="text-dust text-sm">{featured.artist}</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Scroll prompt */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-[10px] font-mono text-dust/40 tracking-widest">
            SCROLL
          </span>
          <div className="w-px h-8 bg-gradient-to-b from-dust/40 to-transparent" />
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
