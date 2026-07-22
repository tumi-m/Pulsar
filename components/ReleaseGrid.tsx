"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Release } from "@/lib/types";
import { ReleaseCard } from "./ReleaseCard";
import { ReleaseDetail } from "./ReleaseDetail";
import { GenreFilter } from "./GenreFilter";
import { OnboardingQuiz } from "./OnboardingQuiz";
import { FormatPicker } from "./FormatPicker";
import { FloatingDock } from "./FloatingDock";
import { Visualizer } from "./Visualizer";
import { genreBucket, GENRE_BUCKETS, type GenreBucket } from "@/lib/utils";
import { loadFormat, saveFormat, type MediaFormat } from "@/lib/format";
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
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("latest");
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [visualizing, setVisualizing] = useState<Release | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [format, setFormat] = useState<MediaFormat>("vinyl");
  const [showRefine, setShowRefine] = useState(false);
  const [query, setQuery] = useState("");

  const detailOpen = Boolean(selectedRelease);

  useEffect(() => {
    const p = loadProfile();
    if (p) setProfile(p);
    else if (!localStorage.getItem(SKIP_KEY)) setShowQuiz(true);
    setFormat(loadFormat());
  }, []);

  const labels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of releases) {
      if (r.label) counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l);
  }, [releases]);

  const available = useMemo(() => {
    const present = new Set<GenreBucket>();
    for (const r of releases) {
      const b = genreBucket(r.genre);
      if (b) present.add(b);
    }
    return GENRE_BUCKETS.filter((g) => present.has(g));
  }, [releases]);

  const hasCharts = useMemo(() => releases.some((r) => (r.popularity ?? 0) > 0), [releases]);

  const filtered = useMemo(() => {
    let list = releases;
    if (view === "streamed") {
      list = list.filter((r) => (r.popularity ?? 0) > 0).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else if (view === "foryou" && profile) {
      list = list
        .map((r) => ({ r, s: scoreRelease(r, profile) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s)
        .map(({ r }) => r);
    }
    if (activeGenre) list = list.filter((r) => genreBucket(r.genre) === activeGenre);
    if (activeLabel) list = list.filter((r) => r.label === activeLabel);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.artist.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          (r.genre ?? "").toLowerCase().includes(q) ||
          (r.label ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [releases, activeGenre, activeLabel, view, profile, query]);

  const shown = filtered.slice(0, visible);
  const sizes = useMemo(() => tileSizes(shown, profile), [shown, profile]);
  const hasMore = visible < filtered.length;

  const resetPage = () => setVisible(PAGE);

  // Infinite scroll — auto-load the next page as the sentinel nears view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => v + PAGE);
      },
      { rootMargin: "800px 0px" } // prefetch well before the bottom
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filtered.length]);

  // Grid columns reflow when the half-page detail is open.
  const gridCols = detailOpen
    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3"
    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  const refineActive =
    view !== "latest" || Boolean(activeLabel) || format !== "vinyl";

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

      {/* everything that reflows when the detail sheet opens */}
      <div
        className={`transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          detailOpen ? "lg:pr-[50vw]" : ""
        }`}
      >
        {/* ── the menu: search + genre by default, one quiet "Refine" ── */}
        <div className="sticky top-14 z-30 mb-6 bg-void/85 px-6 py-3 backdrop-blur-xl md:px-10">
          {/* search */}
          <div className="mb-3 flex items-center gap-2 rounded-full border border-star-white/12 bg-star-white/[0.03] px-4 py-2 focus-within:border-star-white/30">
            <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0 text-star-white/40" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="6" />
              <path d="M14 14l4 4" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Search artists, albums, genres…"
              className="w-full bg-transparent text-sm text-star-white placeholder:text-star-white/35 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex-shrink-0 text-star-white/40 hover:text-star-white"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <GenreFilter
                active={activeGenre}
                onChange={(g) => {
                  setActiveGenre(g);
                  resetPage();
                }}
                available={available}
              />
            </div>
            <button
              onClick={() => setShowRefine((v) => !v)}
              aria-expanded={showRefine}
              className={`flex flex-shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${
                showRefine || refineActive ? "text-star-white" : "text-star-white/40 hover:text-star-white"
              }`}
            >
              Refine
              {refineActive && <span className="h-1 w-1 rounded-full bg-neon-violet" />}
              <span className={`transition-transform ${showRefine ? "rotate-180" : ""}`}>⌄</span>
            </button>
          </div>

          {/* refine drawer — advanced controls, hidden by default */}
          <AnimatePresence>
            {showRefine && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 pt-4">
                  {/* view + format */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {(["latest", ...(hasCharts ? ["streamed"] : []), ...(profile ? ["foryou"] : [])] as ViewMode[]).map(
                        (v) => (
                          <button
                            key={v}
                            onClick={() => {
                              setView(v);
                              resetPage();
                            }}
                            className={`border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                              view === v
                                ? "border-star-white bg-star-white text-void"
                                : "border-star-white/20 text-star-white/45 hover:border-star-white/60 hover:text-star-white"
                            }`}
                          >
                            {v === "latest" ? "Latest" : v === "streamed" ? "Most Streamed" : "For You"}
                          </button>
                        )
                      )}
                    </div>
                    <span className="hidden h-4 w-px bg-star-white/15 sm:block" />
                    <FormatPicker
                      active={format}
                      onChange={(f) => {
                        setFormat(f);
                        saveFormat(f);
                      }}
                    />
                    <button
                      onClick={() => {
                        clearProfile();
                        localStorage.removeItem(SKIP_KEY);
                        setProfile(null);
                        setView("latest");
                        setShowQuiz(true);
                      }}
                      className="text-[9px] font-bold uppercase tracking-[0.2em] text-star-white/30 transition-colors hover:text-star-white"
                    >
                      {profile ? "Retake quiz →" : "Take quiz →"}
                    </button>
                  </div>

                  {/* labels */}
                  {labels.length > 0 && (
                    <div className="scrollbar-none flex items-center gap-1 overflow-x-auto">
                      <span className="flex-shrink-0 pr-1 text-[9px] font-bold uppercase tracking-[0.24em] text-star-white/30">
                        Label
                      </span>
                      <button
                        onClick={() => {
                          setActiveLabel(null);
                          resetPage();
                        }}
                        className={`flex-shrink-0 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors ${
                          activeLabel === null ? "text-star-white" : "text-star-white/35 hover:text-star-white/70"
                        }`}
                      >
                        All
                      </button>
                      {labels.map((l) => (
                        <button
                          key={l}
                          onClick={() => {
                            setActiveLabel(activeLabel === l ? null : l);
                            resetPage();
                          }}
                          className={`flex-shrink-0 whitespace-nowrap border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] transition-colors ${
                            activeLabel === l
                              ? "border-neon-green/60 bg-neon-green/10 text-neon-green"
                              : "border-star-white/15 text-star-white/40 hover:border-star-white/40 hover:text-star-white"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* grid */}
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
            <p className="font-mono text-sm tracking-widest text-star-white/30">NOTHING HERE YET</p>
          </div>
        ) : (
          <div className={`grid grid-flow-dense gap-2.5 px-3 md:gap-3 md:px-5 ${gridCols}`}>
            {shown.map((release, i) => (
              <ReleaseCard
                key={release.id}
                release={release}
                index={i}
                size={(sizes[i] ?? 0) as 0 | 1 | 2}
                forYou={Boolean(profile) && (sizes[i] ?? 0) > 0}
                format={format}
                onOpen={setSelectedRelease}
              />
            ))}
          </div>
        )}

        {/* infinite-scroll sentinel + subtle loader */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-14">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-star-white/30">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon-violet" />
              Loading more
            </div>
          </div>
        )}
      </div>

      {/* half-page detail sheet */}
      <ReleaseDetail
        release={selectedRelease}
        onClose={() => setSelectedRelease(null)}
        onVisualize={(r) => {
          setSelectedRelease(null);
          setVisualizing(r);
        }}
      />

      {/* live audio-reactive 3D visualizer */}
      <Visualizer release={visualizing} onClose={() => setVisualizing(null)} />

      {/* floating 3D dock — favorites / playlist / share */}
      <FloatingDock format={format} onOpen={setSelectedRelease} />
    </>
  );
}
