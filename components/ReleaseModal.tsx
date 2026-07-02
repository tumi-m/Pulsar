"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Artwork } from "./Artwork";
import type { Release } from "@/lib/types";
import { MOOD_COLORS, MOOD_LABELS, formatDate } from "@/lib/utils";
import { PlatformLinks } from "./PlatformLinks";

interface ReleaseModalProps {
  release: Release | null;
  onClose: () => void;
}

export function ReleaseModal({ release, onClose }: ReleaseModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (release) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [release]);

  const mood = release?.mood ?? "ambient";
  const moodStyle = MOOD_COLORS[mood] ?? MOOD_COLORS.ambient;

  return (
    <AnimatePresence>
      {release && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="fixed inset-0 bg-void/90 backdrop-blur-md z-50"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-lg bg-cosmos/95 border border-mist/20 rounded-2xl overflow-hidden pointer-events-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Background glow */}
              <div
                className={`absolute inset-0 pointer-events-none opacity-20 ${moodStyle.bg}`}
                style={{ filter: "blur(60px)" }}
              />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-mist/20 hover:bg-mist/40 flex items-center justify-center transition-colors text-dust hover:text-star-white"
              >
                <X size={16} />
              </button>

              {/* Artwork + content */}
              <div className="relative flex flex-col">
                {/* Full-width artwork */}
                <div className="relative aspect-square w-full">
                  <Artwork
                    src={release.artwork_url}
                    artist={release.artist}
                    title={release.title}
                    sizes="512px"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-cosmos/90 via-transparent to-transparent" />

                  {/* Info overlay on artwork */}
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex items-center gap-2 mb-2">
                      {release.mood && (
                        <span className={`text-[10px] font-mono font-bold tracking-widest ${moodStyle.text}`}>
                          {MOOD_LABELS[release.mood]}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-dust/60 tracking-widest uppercase">
                        {release.type}
                      </span>
                    </div>
                    <h2 className="text-star-white font-bold text-2xl leading-tight">
                      {release.title}
                    </h2>
                    <p className="text-dust text-sm mt-1">{release.artist}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="relative p-6 space-y-4">
                  {release.curator_note && (
                    <p className="text-star-white/80 text-sm italic leading-relaxed border-l-2 border-mist/30 pl-4">
                      "{release.curator_note}"
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 text-xs font-mono text-dust">
                    <span>{formatDate(release.release_date)}</span>
                    {release.genre && (
                      <>
                        <span className="text-mist/40">·</span>
                        <span>{release.genre}</span>
                      </>
                    )}
                  </div>

                  {release.tags && release.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {release.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mist/20 text-dust/70 border border-mist/20"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Platform links */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-mono text-dust/50 tracking-widest uppercase">
                      Listen on
                    </p>
                    <PlatformLinks release={release} variant="modal" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
