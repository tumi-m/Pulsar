"use client";

import { motion } from "framer-motion";
import { MOOD_COLORS, MOOD_LABELS } from "@/lib/utils";
import type { MoodTag } from "@/lib/types";

const MOODS: MoodTag[] = [
  "euphoric",
  "melancholic",
  "energetic",
  "ambient",
  "raw",
  "cinematic",
  "hypnotic",
  "tender",
];

interface MoodFilterProps {
  active: MoodTag | null;
  onChange: (mood: MoodTag | null) => void;
}

export function MoodFilter({ active, onChange }: MoodFilterProps) {
  return (
    <div className="relative">
      {/* Scroll container */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {/* All */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange(null)}
          className={`
            flex-shrink-0 text-[11px] font-mono font-bold tracking-widest
            px-4 py-1.5 rounded-full border transition-all duration-200
            ${active === null
              ? "bg-star-white/10 border-star-white/30 text-star-white"
              : "border-mist/30 text-dust hover:border-mist/60 hover:text-star-white"
            }
          `}
        >
          ALL
        </motion.button>

        {MOODS.map((mood) => {
          const style = MOOD_COLORS[mood];
          const isActive = active === mood;
          return (
            <motion.button
              key={mood}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(isActive ? null : mood)}
              className={`
                flex-shrink-0 text-[11px] font-mono font-bold tracking-widest
                px-4 py-1.5 rounded-full border transition-all duration-200
                ${isActive
                  ? `${style.bg} ${style.text} border-current/30`
                  : "border-mist/30 text-dust hover:border-mist/60 hover:text-star-white"
                }
              `}
            >
              {MOOD_LABELS[mood]}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
