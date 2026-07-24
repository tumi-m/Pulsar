"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, AudioLines, Library, ListMusic, Youtube, Sparkles } from "lucide-react";
import { CrateIcon } from "./CrateIcon";

interface HeroSectionProps {
  totalReleases: number;
  totalToday: number;
}

// The rotating "what Pulsar does" reel under the letterhead.
const FEATURES: { icon: React.ReactNode; text: string; color: string }[] = [
  { icon: <Mic2 size={13} />, text: "Lyrics for every track", color: "#4aa3ff" },
  { icon: <AudioLines size={13} />, text: "Uncover the samples behind a song", color: "#9b5de5" },
  { icon: <Library size={13} />, text: "A directory of 29+ genres", color: "#00d4ff" },
  { icon: <ListMusic size={13} />, text: "Build playlists on Spotify, Apple & more", color: "#1DB954" },
  { icon: <CrateIcon size={13} className="text-current" />, text: "Curate your own crates", color: "#d69a5c" },
  { icon: <Youtube size={13} />, text: "Music videos & live performances", color: "#ff5b5b" },
  { icon: <Sparkles size={13} />, text: "Selector AI finds your vibe", color: "#ff5fa2" },
];

/**
 * Minimal hero — the Pulsar letterhead plus a rotating reel that explains each
 * feature with a soft transition.
 */
export function HeroSection({ totalReleases, totalToday }: HeroSectionProps) {
  void totalReleases;
  void totalToday;
  // When the album/tracklist panel opens (right half), re-center the Pulsar
  // letterhead over the visible left half.
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", on);
    return () => window.removeEventListener("pulsar-detail-open", on);
  }, []);

  // Cycle through the feature reel.
  const [featureIdx, setFeatureIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFeatureIdx((i) => (i + 1) % FEATURES.length), 2800);
    return () => clearInterval(id);
  }, []);
  const feature = FEATURES[featureIdx];

  // Spacing follows the Fibonacci sequence (21 / 34 / 89 / 144 px) so the
  // letterhead sits in golden proportion above the search bar.
  return (
    <section
      className={`px-[21px] pb-[34px] pt-[89px] text-center transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:pt-[144px] ${
        detailOpen ? "lg:pr-[50vw]" : ""
      }`}
    >
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl text-5xl font-bold tracking-tight md:text-8xl"
        style={{
          background: "linear-gradient(120deg, #ffe8c9 0%, #ff9d5c 22%, #ff5fa2 48%, #9b5de5 72%, #00d4ff 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pulsar
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.9 }}
        className="mt-[13px] text-[11px] font-bold uppercase tracking-[0.4em] text-star-white/45"
      >
        Music discovery
      </motion.p>

      {/* rotating feature reel — one glass pill whose contents transition */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8 }}
        className="mt-[21px] flex h-8 items-center justify-center"
      >
        <div
          className="relative flex h-8 items-center gap-2 overflow-hidden rounded-full border border-white/10 pl-1.5 pr-4"
          style={{
            background: "rgba(10,10,18,0.5)",
            backdropFilter: "blur(14px) saturate(160%)",
            WebkitBackdropFilter: "blur(14px) saturate(160%)",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={featureIdx}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-2"
            >
              <span
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${feature.color}26`, color: feature.color }}
              >
                {feature.icon}
              </span>
              <span className="whitespace-nowrap text-[11px] font-semibold tracking-wide text-star-white/80">
                {feature.text}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* progress dots for the reel */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {FEATURES.map((_, i) => (
          <button
            key={i}
            onClick={() => setFeatureIdx(i)}
            aria-label={`Feature ${i + 1}`}
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: i === featureIdx ? 14 : 4,
              backgroundColor: i === featureIdx ? feature.color : "rgba(232,232,244,0.25)",
            }}
          />
        ))}
      </div>
    </section>
  );
}
