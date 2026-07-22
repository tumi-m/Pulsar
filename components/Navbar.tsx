"use client";

import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useRef, useState } from "react";
import { CalabiYau } from "./CalabiYau";

export function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const prevY = useRef(0);

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 24);
    // Hide the header when swiping/scrolling down; reveal on the way up.
    if (y > prevY.current && y > 90) setHidden(true);
    else if (y < prevY.current - 4) setHidden(false);
    prevY.current = y;
  });

  return (
    <motion.nav
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: hidden ? -64 : 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`
        fixed inset-x-0 top-0 z-40 h-14 transform-gpu px-5 md:px-10
        transition-colors duration-500
        ${scrolled ? "border-b border-star-white/[0.06] bg-void/70 backdrop-blur-xl" : "bg-transparent"}
      `}
    >
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("pulsar-toggle-sidebar"))}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-star-white/70 transition-colors hover:bg-star-white/10 hover:text-star-white"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="h-[1.5px] w-4 rounded-full bg-current" />
              <span className="h-[1.5px] w-4 rounded-full bg-current" />
              <span className="h-[1.5px] w-4 rounded-full bg-current" />
            </span>
          </button>
          <Link href="/" className="flex items-center gap-2.5">
            <CalabiYau size={22} />
            <span className="text-sm font-bold uppercase tracking-[0.3em] text-star-white">
              PULSAR
            </span>
          </Link>
        </div>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent("pulsar-ai-activate"))}
          aria-label="AI assistant"
          className="flex items-center gap-2 rounded-full px-4 py-2 transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(120deg, #9b5de5, #ff5fa2 60%, #ffb347)",
            boxShadow: "0 4px 16px rgba(155,93,229,0.45)",
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">AI</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute h-full w-full animate-ping rounded-full bg-white/80" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        </button>
      </div>
    </motion.nav>
  );
}
