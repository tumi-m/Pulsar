"use client";

import { motion } from "framer-motion";
import { GENRE_BUCKETS, GENRE_COLORS, type GenreBucket } from "@/lib/utils";

interface GenreFilterProps {
  active: GenreBucket | null;
  onChange: (genre: GenreBucket | null) => void;
  available: GenreBucket[];
}

export function GenreFilter({ active, onChange, available }: GenreFilterProps) {
  const genres = GENRE_BUCKETS.filter((g) => available.includes(g));

  return (
    <div className="relative">
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

        {genres.map((genre) => {
          const style = GENRE_COLORS[genre];
          const isActive = active === genre;
          return (
            <motion.button
              key={genre}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(isActive ? null : genre)}
              className={`
                flex-shrink-0 text-[11px] font-mono font-bold tracking-widest
                px-4 py-1.5 rounded-full border transition-all duration-200 uppercase
                ${isActive
                  ? `${style.bg} ${style.text} border-current/30`
                  : "border-mist/30 text-dust hover:border-mist/60 hover:text-star-white"
                }
              `}
            >
              {genre}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
