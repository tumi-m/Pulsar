"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import type { Release } from "@/lib/types";
import { ReleaseCard } from "./ReleaseCard";
import { ReleaseDetail } from "./ReleaseDetail";
import { GenreFilter } from "./GenreFilter";
import { OnboardingQuiz } from "./OnboardingQuiz";
import { FormatPicker } from "./FormatPicker";
import { FloatingDock } from "./FloatingDock";
import { Visualizer } from "./Visualizer";
import { AiChat } from "./AiChat";
import { CratePicker } from "./CratePicker";
import { usePlayer } from "./player/PlayerProvider";
import { genreBucket, GENRE_BUCKETS, type GenreBucket } from "@/lib/utils";
import { loadFormat, saveFormat, type MediaFormat } from "@/lib/format";
import {
  loadProfile,
  clearProfile,
  scoreRelease,
  tileSizes,
  learnedProfile,
  type TasteProfile,
} from "@/lib/taste";
import { getFavorites, getPlaylist } from "@/lib/collection";

interface ReleaseGridProps {
  releases: Release[];
}

const PAGE = 60;
const SKIP_KEY = "pulsar_quiz_skipped";

type ViewMode = "latest" | "streamed" | "foryou";

export function ReleaseGrid({ releases }: ReleaseGridProps) {
  const player = usePlayer();
  const [activeGenre, setActiveGenre] = useState<GenreBucket | null>(null);
  const [activeType, setActiveType] = useState<"all" | "album" | "ep" | "single">("all");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("latest");
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [visualizing, setVisualizing] = useState<Release | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [format, setFormat] = useState<MediaFormat>("vinyl");
  const [showRefine, setShowRefine] = useState(false);
  const [showGenres, setShowGenres] = useState(false);
  const [query, setQuery] = useState("");

  // Tiles hold perfectly still while scrolling, then settle together with one
  // gentle nudge the moment scrolling stops. `scrolling` also disables the
  // per-tile tap animation so tiles never flinch mid-scroll on mobile.
  const gridControls = useAnimationControls();
  const [scrolling, setScrolling] = useState(false);
  // atTop: search bar rests below the letterhead; once scrolled it follows the
  // user at the bottom (thumb reach). framer `layout` glides between the two.
  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setScrolling((s) => (s ? s : true));
      setAtTop(window.scrollY < 80);
      clearTimeout(t);
      t = setTimeout(() => {
        setScrolling(false);
        gridControls.start({
          y: [6, 0],
          transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }, // smooth, no bounce
        });
      }, 180); // fire once scrolling has actually stopped
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, [gridControls]);

  const detailOpen = Boolean(selectedRelease);

  // Tell the navbar when album mode is open so its header can go symmetrical.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pulsar-detail-open", { detail: detailOpen }));
  }, [detailOpen]);

  // Tell the navbar / visualizer whether we're in visualiser mode.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pulsar-visualizing", { detail: Boolean(visualizing) }));
  }, [visualizing]);

  // bumps whenever the user favorites/crates something → recompute recs
  const [collectionVersion, setCollectionVersion] = useState(0);

  useEffect(() => {
    const p = loadProfile();
    if (p) setProfile(p);
    else if (!localStorage.getItem(SKIP_KEY)) setShowQuiz(true);
    setFormat(loadFormat());
    const onChange = () => setCollectionVersion((v) => v + 1);
    const onFormat = (e: Event) => setFormat((e as CustomEvent<MediaFormat>).detail);
    const onType = (e: Event) => {
      setActiveType((e as CustomEvent<"all" | "album" | "ep" | "single">).detail);
      setVisible(PAGE);
    };
    const onRetake = () => {
      clearProfile();
      localStorage.removeItem(SKIP_KEY);
      setProfile(null);
      setView("latest");
      setShowQuiz(true);
    };
    const onSearch = (e: Event) => {
      setQuery((e as CustomEvent<string>).detail);
      setVisible(PAGE);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const onCloseDetail = () => setSelectedRelease(null);
    window.addEventListener("pulsar-close-detail", onCloseDetail);
    window.addEventListener("pulsar-search", onSearch);
    window.addEventListener("pulsar-collection-change", onChange);
    window.addEventListener("pulsar-format-change", onFormat);
    window.addEventListener("pulsar-type-change", onType);
    window.addEventListener("pulsar-retake-quiz", onRetake);
    return () => {
      window.removeEventListener("pulsar-collection-change", onChange);
      window.removeEventListener("pulsar-format-change", onFormat);
      window.removeEventListener("pulsar-type-change", onType);
      window.removeEventListener("pulsar-retake-quiz", onRetake);
      window.removeEventListener("pulsar-search", onSearch);
      window.removeEventListener("pulsar-close-detail", onCloseDetail);
    };
  }, []);

  // The recommender profile: quiz taste + learned affinities from actions.
  const recProfile = useMemo(
    () => learnedProfile(profile, getFavorites(), getPlaylist()),
    [profile, collectionVersion]
  );

  // Releases ranked highest-for-you first — the pool shuffle draws from.
  const rankedForYou = useMemo(() => {
    if (!recProfile) return releases;
    return [...releases]
      .map((r) => ({ r, s: scoreRelease(r, recProfile) }))
      .sort((a, b) => b.s - a.s)
      .map(({ r }) => r);
  }, [releases, recProfile]);

  // Keep a live ref to whether the visualizer is open so a shuffle-advance can
  // swap its artwork to the new track without stale closures.
  const visualizingRef = useRef<Release | null>(null);
  useEffect(() => {
    visualizingRef.current = visualizing;
  }, [visualizing]);

  // Tracks already played this shuffle cycle — so shuffle never repeats a song
  // until the whole pool has been heard.
  const playedRef = useRef<Set<string>>(new Set());

  // Register the shuffle picker: on preview end, advance to the next taste-
  // ranked track that hasn't played yet (no repeats until the pool is dry).
  useEffect(() => {
    player.setNextProvider((cur) => {
      if (cur) playedRef.current.add(cur.id);
      const pool = rankedForYou.slice(0, Math.max(20, Math.min(120, rankedForYou.length)));
      let fresh = pool.filter((r) => r.id !== cur?.id && !playedRef.current.has(r.id));
      if (!fresh.length) {
        // Whole pool heard — start a new cycle (still skip the current track).
        playedRef.current.clear();
        if (cur) playedRef.current.add(cur.id);
        fresh = pool.filter((r) => r.id !== cur?.id);
      }
      if (!fresh.length) return null;
      const next = fresh[Math.floor(Math.random() * fresh.length)];
      playedRef.current.add(next.id);
      // If the visualizer is open, follow the new track's art.
      if (visualizingRef.current) setVisualizing(next);
      return next;
    });
    return () => player.setNextProvider(null);
  }, [player, rankedForYou]);

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
    } else if (view === "foryou" && recProfile) {
      list = list
        .map((r) => ({ r, s: scoreRelease(r, recProfile) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s)
        .map(({ r }) => r);
    }
    if (activeType !== "all") list = list.filter((r) => r.type === activeType);
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
  }, [releases, activeGenre, activeType, activeLabel, view, recProfile, query]);

  const shown = filtered.slice(0, visible);
  const searching = query.trim().length > 0;
  // In search mode, keep every tile the same size so results pack tightly with
  // no empty gaps; otherwise use the taste-driven dynamic sizing.
  const sizes = useMemo(
    () => (searching ? shown.map(() => 0) : tileSizes(shown, recProfile)),
    [shown, recProfile, searching]
  );
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

  // Grid columns reflow when the half-page detail is open — fewer columns so
  // the tiles read ~15% larger in tracklist mode.
  const gridCols = detailOpen
    ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3"
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

      {/* everything that reflows when the detail sheet opens. Bottom padding
          (Fibonacci: 34 / 89px) keeps the last row clear of the player bar. */}
      <div
        className={`transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          detailOpen ? "lg:pr-[50vw]" : ""
        } ${player.current ? "pb-[178px]" : "pb-[110px]"}`}
      >
        {/* ── search block — rests below the letterhead at the top, and
            elegantly FOLLOWS the user to the bottom (above the player, no gap)
            once they scroll. framer `layout` glides between the two. ── */}
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className={`fixed inset-x-0 z-40 flex flex-col-reverse items-center gap-[8px] border-white/10 bg-void/45 px-[21px] py-[10px] backdrop-blur-2xl md:px-10 ${
            detailOpen ? "pointer-events-none opacity-0" : "opacity-100"
          } ${
            atTop
              ? "top-[150px] border-b md:top-[248px]"
              : `border-t ${player.current ? "bottom-[64px]" : "bottom-0"}`
          }`}
        >
          {/* search — golden-ratio width (61.8% ≈ 1/φ), centered. Dims when
              docked at the bottom so it recedes while browsing. */}
          <div
            className={`search-rainbow w-[86%] rounded-full p-[1.5px] transition-opacity duration-300 md:w-[61.8%] ${
              atTop ? "opacity-100" : "opacity-[0.55]"
            }`}
          >
            <div className="flex items-center gap-2 rounded-full px-4 py-2"
              style={{
                background: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 8px rgba(0,0,0,0.3)",
              }}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0 text-star-white/70" fill="none" stroke="currentColor" strokeWidth="2">
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
                className="w-full bg-transparent text-sm font-medium text-white placeholder:text-star-white/55 focus:outline-none"
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
          </div>

          {/* controls row — bigger menu button grouped with Genre / Refine,
              centred as one elegant, symmetrical cluster */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("pulsar-toggle-sidebar"))}
              aria-label="Open menu"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-white/30 text-star-white/90 transition-transform hover:scale-105 active:scale-95"
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(18px) saturate(180%)",
                WebkitBackdropFilter: "blur(18px) saturate(180%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 5px rgba(0,0,0,0.3), 0 6px 16px rgba(0,0,0,0.4)",
              }}
            >
              <span className="flex flex-col gap-[3.5px]">
                <span className="h-[2px] w-5 rounded-full bg-current" />
                <span className="h-[2px] w-5 rounded-full bg-current" />
                <span className="h-[2px] w-5 rounded-full bg-current" />
              </span>
            </button>
            {/* expandable Genre button */}
            <button
              onClick={() => setShowGenres((v) => !v)}
              aria-expanded={showGenres}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                activeGenre
                  ? "border-star-white/40 bg-star-white/[0.06] text-star-white"
                  : "border-star-white/15 text-star-white/55 hover:border-star-white/40 hover:text-star-white"
              }`}
            >
              {activeGenre ?? "Genre"}
              <span className={`transition-transform ${showGenres ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {activeGenre && (
              <button
                onClick={() => {
                  setActiveGenre(null);
                  resetPage();
                }}
                aria-label="Clear genre"
                className="text-[10px] font-bold uppercase tracking-widest text-star-white/35 hover:text-star-white"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setShowRefine((v) => !v)}
              aria-expanded={showRefine}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${
                showRefine || refineActive
                  ? "border-star-white/40 bg-star-white/[0.06] text-star-white"
                  : "border-star-white/15 text-star-white/40 hover:border-star-white/40 hover:text-star-white"
              }`}
            >
              Refine
              {refineActive && <span className="h-1 w-1 rounded-full bg-neon-violet" />}
              <span className={`transition-transform ${showRefine ? "rotate-180" : ""}`}>⌄</span>
            </button>
          </div>

          {/* genre drawer — pills, hidden until the Genre button is tapped */}
          <AnimatePresence>
            {showGenres && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  <GenreFilter
                    active={activeGenre}
                    onChange={(g) => {
                      setActiveGenre(g);
                      resetPage();
                      setShowGenres(false);
                    }}
                    available={available}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
        </motion.div>

        {/* grid */}
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
            <p className="font-mono text-sm tracking-widest text-star-white/30">NOTHING HERE YET</p>
          </div>
        ) : (
          <motion.div
            animate={gridControls}
            className={`grid grid-flow-dense gap-[13px] px-[13px] md:gap-[21px] md:px-[21px] ${gridCols}`}
          >
            {shown.map((release, i) => (
              <ReleaseCard
                key={release.id}
                release={release}
                index={i}
                size={(sizes[i] ?? 0) as 0 | 1 | 2}
                forYou={Boolean(recProfile) && (sizes[i] ?? 0) > 0}
                format={format}
                scrolling={scrolling}
                onOpen={setSelectedRelease}
              />
            ))}
          </motion.div>
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
        onOpen={setSelectedRelease}
        onVisualize={(r) => {
          setSelectedRelease(null);
          setVisualizing(r);
        }}
      />

      {/* live audio-reactive 3D visualizer */}
      <Visualizer release={visualizing} onClose={() => setVisualizing(null)} />

      {/* floating 3D dock — favorites / crate / share */}
      <FloatingDock format={format} onOpen={setSelectedRelease} />

      {/* AI mood/taste assistant */}
      <AiChat releases={releases} />

      {/* "add to which crate?" picker (event-driven, global) */}
      <CratePicker />
    </>
  );
}
