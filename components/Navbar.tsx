"use client";

import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Shuffle, Sparkles } from "lucide-react";
import { CrateIcon } from "./CrateIcon";
import { usePlayer } from "./player/PlayerProvider";

export function Navbar() {
  const { scrollY } = useScroll();
  const player = usePlayer();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const prevY = useRef(0);

  // Album mode (detail sheet) opens on the right half; confine the header to
  // the left half so the controls sit symmetrically over the grid below.
  useEffect(() => {
    const onDetail = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", onDetail);
    return () => window.removeEventListener("pulsar-detail-open", onDetail);
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
        {/* left spacer — the menu button now lives in the search block */}
        <div className="h-11 w-11" aria-hidden />

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
          <Sparkles size={14} className="text-white" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">Selector</span>
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("pulsar-open-crate", { detail: "playlist" }))}
          aria-label="Open your crate"
          className="flex items-center gap-2 rounded-full border border-[#c08a4e]/40 bg-[#c08a4e]/10 px-4 py-2 transition-all hover:scale-105 hover:border-[#c08a4e]/70 hover:bg-[#c08a4e]/20 active:scale-95"
        >
          <CrateIcon size={16} filled className="text-[#d69a5c]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#e0b070]">Crate</span>
        </button>
        </div>
      </div>
    </motion.nav>
    </>
  );
}
