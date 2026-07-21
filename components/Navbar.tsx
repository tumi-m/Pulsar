"use client";

import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";

export function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 24);
  });

  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className={`
        fixed inset-x-0 top-0 z-40 h-14 px-5 md:px-10
        transition-colors duration-500
        ${scrolled ? "border-b border-star-white/[0.06] bg-void/70 backdrop-blur-xl" : "bg-transparent"}
      `}
    >
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-star-white/60 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-star-white" />
          </span>
          <span className="text-sm font-semibold tracking-[0.28em] text-star-white">
            PULSAR
          </span>
        </Link>

        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-star-white/35">
          {new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </motion.nav>
  );
}
