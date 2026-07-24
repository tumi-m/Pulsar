"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, AudioLines, Library, ListMusic, Youtube, Sparkles } from "lucide-react";
import { CrateIcon } from "./CrateIcon";

// The rotating "what Pulsar does" reel.
const FEATURES: { icon: React.ReactNode; text: string; color: string }[] = [
  { icon: <Mic2 size={12} />, text: "Lyrics for every track", color: "#4aa3ff" },
  { icon: <AudioLines size={12} />, text: "Find the samples behind a song", color: "#9b5de5" },
  { icon: <Library size={12} />, text: "A directory of 29+ genres", color: "#00d4ff" },
  { icon: <ListMusic size={12} />, text: "Build playlists on Spotify, Apple & more", color: "#1DB954" },
  { icon: <CrateIcon size={12} className="text-current" />, text: "Curate your own crates", color: "#d69a5c" },
  { icon: <Youtube size={12} />, text: "Music videos & live performances", color: "#ff5b5b" },
  { icon: <Sparkles size={12} />, text: "Selector AI finds your vibe", color: "#ff5fa2" },
];

/**
 * A compact, self-cycling reel that explains one feature at a time with a soft
 * blur/slide transition. Lives just under the search bar.
 */
export function FeatureReel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % FEATURES.length), 2800);
    return () => clearInterval(id);
  }, []);
  const f = FEATURES[i];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-7 items-center overflow-hidden rounded-full px-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2"
          >
            <span
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${f.color}26`, color: f.color }}
            >
              {f.icon}
            </span>
            <span className="whitespace-nowrap text-[11px] font-semibold tracking-wide text-star-white/75">
              {f.text}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1.5">
        {FEATURES.map((_, k) => (
          <button
            key={k}
            onClick={() => setI(k)}
            aria-label={`Feature ${k + 1}`}
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: k === i ? 14 : 4,
              backgroundColor: k === i ? f.color : "rgba(232,232,244,0.22)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
