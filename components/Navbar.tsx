"use client";

import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Shuffle, Sparkles, AudioLines } from "lucide-react";
import { CrateIcon } from "./CrateIcon";
import { usePlayer } from "./player/PlayerProvider";

export function Navbar() {
  const { scrollY } = useScroll();
  const player = usePlayer();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [crateOpen, setCrateOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const prevY = useRef(0);
  // Only three buttons sit in the corner; the secondary control (Shuffle)
  // appears after a 2s dwell, the same "rest to reveal more" idiom the release
  // tiles use. On touch there's no hover, so it lives in the floating dock.
  const [dwelled, setDwelled] = useState(false);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (dwellTimer.current) clearTimeout(dwellTimer.current);
  }, []);

  // Album mode (detail sheet) opens on the right half; confine the header to
  // the left half so the controls sit symmetrically over the grid below.
  useEffect(() => {
    const onDetail = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    const onCrate = (e: Event) => setCrateOpen((e as CustomEvent<boolean>).detail);
    const onSamples = (e: Event) => setSamplesOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", onDetail);
    window.addEventListener("pulsar-crate-open", onCrate);
    window.addEventListener("pulsar-samples-open", onSamples);
    return () => {
      window.removeEventListener("pulsar-detail-open", onDetail);
      window.removeEventListener("pulsar-crate-open", onCrate);
      window.removeEventListener("pulsar-samples-open", onSamples);
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
    <motion.nav
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: hidden ? -64 : 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      // The header only slides out of sight — it stays at full opacity, so its
      // buttons remained clickable and, worse, tabbable while off-screen: a
      // keyboard visitor scrolling down would focus Selector, Samples and
      // Crate with nothing visible on the page. `inert` takes the whole bar out
      // of the tab order and out of hit-testing while it's away, and gives it
      // back the moment a scroll up brings it down.
      inert={hidden}
      className={`
        fixed inset-x-0 top-0 z-40 h-14 transform-gpu px-5 md:px-10
        transition-colors duration-500
        ${scrolled ? "border-b border-ink/[0.06] bg-deck/70 backdrop-blur-xl" : "bg-transparent"}
      `}
    >
      <div
        className={`mx-auto flex h-full max-w-screen-2xl items-center justify-between transition-[padding,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          detailOpen || crateOpen || samplesOpen ? "lg:pr-[50vw]" : ""
        } ${
          // The crate sheet covers this area on phones — get out of its way so
          // nothing sits on top of the panel's Export button.
          crateOpen ? "pointer-events-none opacity-0 lg:pointer-events-auto lg:opacity-100" : ""
        }`}
      >
        {/* left spacer — the menu button now lives in the search block */}
        <div className="h-11 w-11" aria-hidden />

        <div
          className="flex items-center gap-2"
          onMouseEnter={() => {
            if (dwellTimer.current) clearTimeout(dwellTimer.current);
            dwellTimer.current = setTimeout(() => setDwelled(true), 2000);
          }}
          onMouseLeave={() => {
            if (dwellTimer.current) clearTimeout(dwellTimer.current);
            setDwelled(false);
          }}
        >
        {/* Shuffle — secondary, so it stays out of the way until you rest here.
            `aria-hidden` while collapsed keeps it out of the tab order too. */}
        <button
          onClick={() => player.toggleShuffle()}
          aria-label="Shuffle to your top picks"
          aria-pressed={player.shuffle}
          aria-hidden={!dwelled && !player.shuffle}
          tabIndex={dwelled || player.shuffle ? 0 : -1}
          title={player.shuffle ? "Shuffle on — plays your top-ranked picks" : "Shuffle off"}
          className={`flex h-9 items-center justify-center overflow-hidden rounded-full border transition-all duration-300 active:scale-95 ${
            // Stays visible whenever shuffle is ON, so an active mode is never
            // hidden behind a hover.
            dwelled || player.shuffle
              ? "w-9 scale-100 opacity-100"
              : "pointer-events-none -ml-2 w-0 border-0 opacity-0"
          } ${
            player.shuffle
              ? "border-[#e8c66a] bg-[#d4af37]/25 text-[#f4d780] shadow-[0_0_16px_rgba(212,175,55,0.6)]"
              : "border-[#d4af37]/40 text-[#e8c66a]/70 hover:border-[#d4af37]/80 hover:text-[#f4d780]"
          }`}
        >
          <Shuffle size={15} className="flex-shrink-0" />
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("pulsar-ai-activate"))}
          aria-label="Selector — pick music by chat or visual survey"
          // The one lit key in the header. Orange means "the thing to press",
          // so it has to be the only orange up here.
          className="flex min-h-9 items-center gap-2 rounded-[11px] border border-[#b84516] px-4 py-2 shadow-key transition-[box-shadow,transform,filter] hover:brightness-110 active:translate-y-px active:shadow-keyed"
          style={{
            background: "var(--grad-transport)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 16px rgba(242,102,44,0.4)",
          }}
        >
          <Sparkles size={14} className="text-deck" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-deck">Selector</span>
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("pulsar-open-samples"))}
          aria-label="Samples — songs built from other records"
          title="Samples"
          // Housing blue, not orange: after the palette swap this sat beside
          // Selector in the same colour, two keys claiming the same meaning.
          // Samples is exploration — information — which is what blue is for.
          className="flex min-h-9 items-center gap-2 rounded-[11px] border border-tps/45 bg-tps/15 px-4 py-2 shadow-key transition-[box-shadow,transform,background-color] hover:bg-tps/25 active:translate-y-px active:shadow-keyed"
        >
          <AudioLines size={15} className="text-[#9dc0e8]" />
          <span className="hidden text-[11px] font-bold uppercase tracking-[0.2em] text-[#bcd4f0] sm:inline">
            Samples
          </span>
        </button>
        {/* data-crate-target is where flyToCrate() lands a saved record. A data
            attribute, so the animation never has to import this component. */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("pulsar-open-crate", { detail: "playlist" }))}
          aria-label="Open your crate"
          data-crate-target=""
          className="flex min-h-9 items-center gap-2 rounded-[11px] border border-[#c08a4e]/45 bg-[#c08a4e]/[0.12] px-4 py-2 shadow-key transition-[box-shadow,transform,background-color] hover:bg-[#c08a4e]/20 active:translate-y-px active:shadow-keyed"
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
