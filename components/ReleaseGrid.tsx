"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { Release, MoodTag } from "@/lib/types";
import { ReleaseCard } from "./ReleaseCard";
import { ReleaseModal } from "./ReleaseModal";
import { MoodFilter } from "./MoodFilter";

interface ReleaseGridProps {
  releases: Release[];
}

export function ReleaseGrid({ releases }: ReleaseGridProps) {
  const [activeMood, setActiveMood] = useState<MoodTag | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);

  const filtered = useMemo(() => {
    if (!activeMood) return releases;
    return releases.filter((r) => r.mood === activeMood);
  }, [releases, activeMood]);

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

        {/* Mood filter */}
        <MoodFilter active={activeMood} onChange={setActiveMood} />
      </motion.div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center px-6">
          <p className="text-dust/40 font-mono text-sm tracking-widest">
            NO RELEASES MATCH THIS MOOD
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
