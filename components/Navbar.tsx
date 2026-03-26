"use client";

import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";

export function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 40);
  });

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`
        fixed top-0 left-0 right-0 z-40 px-6 md:px-12 py-4
        transition-all duration-500
        ${scrolled
          ? "bg-void/80 backdrop-blur-xl border-b border-mist/10"
          : "bg-transparent"
        }
      `}
    >
      <div className="max-w-screen-xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3">
          {/* Pulse indicator */}
          <div className="relative w-3 h-3">
            <div className="absolute inset-0 rounded-full bg-neon-violet" />
            <motion.div
              animate={{ scale: [1, 2, 1], opacity: [0.8, 0, 0.8] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-neon-violet"
            />
          </div>
          <span className="text-star-white font-bold text-lg tracking-tight">
            PULSAR
          </span>
        </Link>

        {/* Right nav */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-[11px] font-mono tracking-widest text-dust hover:text-star-white transition-colors"
          >
            DISCOVER
          </Link>
          <div className="w-px h-4 bg-mist/30" />
          <span className="text-[11px] font-mono tracking-widest text-dust/40">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).toUpperCase()}
          </span>
        </div>
      </div>
    </motion.nav>
  );
}
