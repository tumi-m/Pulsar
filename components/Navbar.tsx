"use client";

import Link from "next/link";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Shuffle } from "lucide-react";
import { CalabiYau } from "./CalabiYau";
import { usePlayer } from "./player/PlayerProvider";

export function Navbar() {
  const { scrollY } = useScroll();
  const player = usePlayer();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [visualizing, setVisualizing] = useState(false);
  const prevY = useRef(0);

  // Album mode (detail sheet) opens on the right half; confine the header to
  // the left half so the logo sits symmetrically over the grid below. In
  // visualiser mode the logo centers (matching the reference layout).
  useEffect(() => {
    const onDetail = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    const onVis = (e: Event) => setVisualizing((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", onDetail);
    window.addEventListener("pulsar-visualizing", onVis);
    return () => {
      window.removeEventListener("pulsar-detail-open", onDetail);
      window.removeEventListener("pulsar-visualizing", onVis);
    };
  }, []);

  const setHiddenBroadcast = (h: boolean) => {
    setHidden((prev) => {
      // Broadcast only on a real change so the dock transition runs once.
      if (prev !== h) window.dispatchEvent(new CustomEvent("pulsar-nav-hidden", { detail: h }));
      return h;
    });
  };

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 24);
    // Hide the header when swiping/scrolling down; reveal on the way up.
    if (y > prevY.current && y > 90) setHiddenBroadcast(true);
    else if (y < prevY.current - 4) setHiddenBroadcast(false);
    prevY.current = y;
  });

  return (
    <>
    {/* Persistent sidebar toggle — stays top-left even when the nav hides */}
    <AnimatePresence>
      {hidden && (
        <motion.button
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.25 }}
          onClick={() => window.dispatchEvent(new CustomEvent("pulsar-toggle-sidebar"))}
          aria-label="Open menu"
          className="fixed left-5 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-star-white/15 bg-void/70 text-star-white/80 backdrop-blur-xl transition-colors hover:bg-star-white/10 hover:text-star-white md:left-10"
        >
          <span className="flex flex-col gap-[3px]">
            <span className="h-[1.5px] w-4 rounded-full bg-current" />
            <span className="h-[1.5px] w-4 rounded-full bg-current" />
            <span className="h-[1.5px] w-4 rounded-full bg-current" />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
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
      <div
        className={`mx-auto flex h-full max-w-screen-2xl items-center justify-between transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          detailOpen ? "lg:pr-[50vw]" : ""
        }`}
      >
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
          <Link
            href="/"
            className={`flex items-center gap-2.5 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              visualizing ? "absolute left-1/2 -translate-x-1/2" : ""
            }`}
          >
            <CalabiYau size={22} />
            <span className="text-sm font-bold uppercase tracking-[0.3em] text-star-white">
              PULSAR
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
        <button
          onClick={() => player.toggleShuffle()}
          aria-label="Shuffle to your top picks"
          aria-pressed={player.shuffle}
          title={player.shuffle ? "Shuffle on — plays your top-ranked picks" : "Shuffle off"}
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-95 ${
            player.shuffle
              ? "border-[#e8c66a] bg-[#d4af37]/25 text-[#f4d780] shadow-[0_0_16px_rgba(212,175,55,0.6)]"
              : "border-[#d4af37]/40 text-[#e8c66a]/70 hover:border-[#d4af37]/80 hover:text-[#f4d780]"
          }`}
        >
          <Shuffle size={15} />
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("pulsar-ai-activate"))}
          aria-label="Selector — pick music by chat or visual survey"
          className="flex items-center gap-2 rounded-full px-4 py-2 transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(120deg, #9b5de5, #ff5fa2 60%, #ffb347)",
            boxShadow: "0 4px 16px rgba(155,93,229,0.45)",
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">Selector</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute h-full w-full animate-ping rounded-full bg-white/80" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        </button>
        </div>
      </div>
    </motion.nav>
    </>
  );
}
