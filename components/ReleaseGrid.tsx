"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { Release } from "@/lib/types";
import { ReleaseCard } from "./ReleaseCard";
import { ReleaseModal } from "./ReleaseModal";
import { GenreFilter } from "./GenreFilter";
import { genreBucket, GENRE_BUCKETS, type GenreBucket } from "@/lib/utils";

interface ReleaseGridProps {
  releases: Release[];
}

export function ReleaseGrid({ releases }: ReleaseGridProps) {
  const [activeGenre, setActiveGenre] = useState<GenreBucket | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);

  // Which genre buckets actually appear in the current release set
  const available = useMemo(() => {
    const present = new Set<GenreBucket>();
    for (const r of releases) {
      const b = genreBucket(r.genre);
      if (b) present.add(b);
    }
    return GENRE_BUCKETS.filter((g) => present.has(g));
  }, [releases]);

  const filtered = useMemo(() => {
    if (!activeGenre) return releases;
    return releases.filter((r) => genreBucket(r.genre) === activeGenre);
  }, [releases, activeGenre]);

  return (
    <>
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="px-6 md:px-12 mb-8"
      >
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="text-star-white font-bold text-2xl tracking-tight">
              Today&apos;s Pulse
            </h2>
            <p className="text-dust text-sm mt-1 font-mono">
              {filtered.length} release{filtered.length !== 1 ? "s" : ""} curated
            </p>
          </div>
          <div className="text-[10px] font-mono text-dust/40 tracking-widest hidden md:block">
            CLICK TO EXPLORE
          </div>
        </div>

        {/* Genre filter */}
        <GenreFilter active={activeGenre} onChange={setActiveGenre} available={available} />
      </motion.div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center px-6">
          <p className="text-dust/40 font-mono text-sm tracking-widest">
            NO RELEASES IN THIS GENRE
          </p>
        </div>
      ) : (
        <div className="px-6 md:px-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 md:gap-6">
          {filtered.map((release, i) => (
            <ReleaseCard
              key={release.id}
              release={release}
              index={i}
              onOpen={setSelectedRelease}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <ReleaseModal
        release={selectedRelease}
        onClose={() => setSelectedRelease(null)}
      />
    </>
  );
}
