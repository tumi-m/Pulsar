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
    `flex-shrink-0 rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-all duration-200 ${
      isActive
        ? "bg-[#4aa3ff] text-void"
        : "text-[#a9d5ff] hover:bg-[#4aa3ff]/15 hover:text-white"
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
