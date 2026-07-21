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

const PAGE = 60;

export function ReleaseGrid({ releases }: ReleaseGridProps) {
  const [activeGenre, setActiveGenre] = useState<GenreBucket | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [visible, setVisible] = useState(PAGE);

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

  const shown = filtered.slice(0, visible);

  return (
    <>
      {/* filter bar — minimal, sticky under the nav */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="sticky top-14 z-30 -mx-3 mb-5 bg-void/75 px-6 py-3 backdrop-blur-xl md:px-10"
      >
        <div className="flex items-center justify-between gap-4">
          <GenreFilter
            active={activeGenre}
            onChange={(g) => {
              setActiveGenre(g);
              setVisible(PAGE);
            }}
            available={available}
          />
          <span className="hidden flex-shrink-0 text-[10px] font-mono tracking-[0.2em] text-star-white/30 md:block">
            {filtered.length} RELEASES
          </span>
        </div>
      </motion.div>

      {/* cosmos grid — dense, image-first, featured tiles every so often */}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
          <p className="font-mono text-sm tracking-widest text-star-white/30">
            NO RELEASES IN THIS GENRE
          </p>
        </div>
      ) : (
        <div className="grid grid-flow-dense grid-cols-2 gap-2.5 px-3 sm:grid-cols-3 md:gap-3 md:px-5 lg:grid-cols-5 xl:grid-cols-6">
          {shown.map((release, i) => (
            <ReleaseCard
              key={release.id}
              release={release}
              index={i}
              featured={i % 11 === 0}
              onOpen={setSelectedRelease}
            />
          ))}
        </div>
      )}

      {/* load more */}
      {visible < filtered.length && (
        <div className="flex justify-center py-12">
          <button
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-full border border-star-white/15 px-8 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-star-white/60 transition-colors hover:border-star-white/40 hover:text-star-white"
          >
            More · {filtered.length - visible} left
          </button>
        </div>
      )}

      <ReleaseModal
        release={selectedRelease}
        onClose={() => setSelectedRelease(null)}
      />
    </>
  );
}
