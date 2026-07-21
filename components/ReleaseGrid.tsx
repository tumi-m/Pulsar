"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Release } from "@/lib/types";
import { ReleaseCard } from "./ReleaseCard";
import { ReleaseModal } from "./ReleaseModal";
import { GenreFilter } from "./GenreFilter";
import { OnboardingQuiz } from "./OnboardingQuiz";
import { genreBucket, GENRE_BUCKETS, type GenreBucket } from "@/lib/utils";
import {
  loadProfile,
  clearProfile,
  scoreRelease,
  tileSizes,
  type TasteProfile,
} from "@/lib/taste";

interface ReleaseGridProps {
  releases: Release[];
}

const PAGE = 60;
const SKIP_KEY = "pulsar_quiz_skipped";

type ViewMode = "latest" | "streamed" | "foryou";

export function ReleaseGrid({ releases }: ReleaseGridProps) {
  const [activeGenre, setActiveGenre] = useState<GenreBucket | null>(null);
  const [view, setView] = useState<ViewMode>("latest");
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);

  // First visit → show the visual taste quiz (client-only, no hydration mismatch)
  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setProfile(p);
    } else if (!localStorage.getItem(SKIP_KEY)) {
      setShowQuiz(true);
    }
  }, []);

  const available = useMemo(() => {
    const present = new Set<GenreBucket>();
    for (const r of releases) {
      const b = genreBucket(r.genre);
      if (b) present.add(b);
    }
    return GENRE_BUCKETS.filter((g) => present.has(g));
  }, [releases]);

  const hasCharts = useMemo(
    () => releases.some((r) => (r.popularity ?? 0) > 0),
    [releases]
  );

  const filtered = useMemo(() => {
    let list = releases;
    if (view === "streamed") {
      list = list
        .filter((r) => (r.popularity ?? 0) > 0)
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else if (view === "foryou" && profile) {
      list = list
        .map((r) => ({ r, s: scoreRelease(r, profile) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s)
        .map(({ r }) => r);
    }
    if (activeGenre) list = list.filter((r) => genreBucket(r.genre) === activeGenre);
    return list;
  }, [releases, activeGenre, view, profile]);

  const shown = filtered.slice(0, visible);
  const sizes = useMemo(() => tileSizes(shown, profile), [shown, profile]);

  const viewPill = (isActive: boolean) =>
    `flex-shrink-0 border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-200 ${
      isActive
        ? "border-star-white bg-star-white text-void"
        : "border-star-white/20 text-star-white/45 hover:border-star-white/60 hover:text-star-white"
    }`;

  return (
    <>
      {/* onboarding quiz — first visit only */}
      <AnimatePresence>
        {showQuiz && (
          <OnboardingQuiz
            onComplete={(p) => {
              setProfile(p);
              setShowQuiz(false);
              setView("foryou");
            }}
            onSkip={() => {
              localStorage.setItem(SKIP_KEY, "1");
              setShowQuiz(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* filter bar — sticky, industrial */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="sticky top-14 z-30 -mx-3 mb-5 bg-void/80 px-6 py-3 backdrop-blur-xl md:px-10"
      >
        <div className="flex flex-col gap-2.5">
          {/* view modes */}
          <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto">
            <button className={viewPill(view === "latest")} onClick={() => { setView("latest"); setVisible(PAGE); }}>
              “Latest”
            </button>
            {hasCharts && (
              <button className={viewPill(view === "streamed")} onClick={() => { setView("streamed"); setVisible(PAGE); }}>
                “Most Streamed”
              </button>
            )}
            {profile && (
              <button className={viewPill(view === "foryou")} onClick={() => { setView("foryou"); setVisible(PAGE); }}>
                “For You” ★
              </button>
            )}
            <span className="mx-2 h-4 w-px flex-shrink-0 bg-star-white/15" />
            <button
              onClick={() => {
                clearProfile();
                localStorage.removeItem(SKIP_KEY);
                setProfile(null);
                setView("latest");
                setShowQuiz(true);
              }}
              className="flex-shrink-0 text-[9px] font-bold uppercase tracking-[0.2em] text-star-white/30 transition-colors hover:text-star-white"
            >
              {profile ? "“Retake Quiz” →" : "“Take the Quiz” →"}
            </button>
            <span className="ml-auto hidden flex-shrink-0 font-mono text-[10px] tracking-[0.2em] text-star-white/30 md:block">
              {filtered.length} RELEASES
            </span>
          </div>
          {/* genres */}
          <GenreFilter
            active={activeGenre}
            onChange={(g) => {
              setActiveGenre(g);
              setVisible(PAGE);
            }}
            available={available}
          />
        </div>
      </motion.div>

      {/* streamed context strip */}
      {view === "streamed" && (
        <p className="mb-4 px-6 text-[9px] font-bold uppercase tracking-[0.25em] text-star-white/30 md:px-10">
          “Charting now” — ranked across streaming platforms, refreshed daily
        </p>
      )}

      {/* cosmos grid — taste-driven tile sizes */}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
          <p className="font-mono text-sm tracking-widest text-star-white/30">
            “NOTHING HERE YET”
          </p>
        </div>
      ) : (
        <div className="grid grid-flow-dense grid-cols-2 gap-2.5 px-3 sm:grid-cols-3 md:gap-3 md:px-5 lg:grid-cols-5 xl:grid-cols-6">
          {shown.map((release, i) => (
            <ReleaseCard
              key={release.id}
              release={release}
              index={i}
              size={(sizes[i] ?? 0) as 0 | 1 | 2}
              forYou={Boolean(profile) && (sizes[i] ?? 0) > 0}
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
            className="border border-star-white/20 px-8 py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-star-white/60 transition-colors hover:border-star-white hover:text-star-white"
          >
            “More” · {filtered.length - visible} left ↓
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
