"use client";

import { GENRE_BUCKETS, type GenreBucket } from "@/lib/utils";

interface GenreFilterProps {
  active: GenreBucket | null;
  onChange: (genre: GenreBucket | null) => void;
  available: GenreBucket[];
}

export function GenreFilter({ active, onChange, available }: GenreFilterProps) {
  const genres = GENRE_BUCKETS.filter((g) => available.includes(g));

  const pill = (isActive: boolean) =>
    `flex-shrink-0 rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-all duration-200 ${
      isActive
        ? "bg-star-white text-void"
        : "text-star-white/45 hover:bg-star-white/[0.07] hover:text-star-white"
    }`;

  return (
    <div className="scrollbar-none flex items-center gap-1 overflow-x-auto">
      <button className={pill(active === null)} onClick={() => onChange(null)}>
        All
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          className={pill(active === genre)}
          onClick={() => onChange(active === genre ? null : genre)}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
