"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { FeatureReel } from "./FeatureReel";
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

  // ── iOS Photos-style pinch-to-zoom grid density ──────────────
  // Pinch OUT → fewer, bigger tiles; pinch IN → more tiles per row. `zoom` is a
  // delta from the width-derived default so the choice survives orientation /
  // window resizes. Trackpad pinch (wheel + ctrl) works too. Min 2 cols keeps
  // the taste-driven span-2 tiles from ever overflowing a row.
  const GRID_MIN = 2;
  const GRID_MAX = 8;
  const [zoom, setZoom] = useState(0);
  const [baseCols, setBaseCols] = useState(3);
  const [colHud, setColHud] = useState<number | null>(null);
  const baseColsRef = useRef(3);
  const zoomRef = useRef(0);
  const detailOpenRef = useRef(false);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchRef = useRef<number | null>(null);
  const gridCleanup = useRef<(() => void) | null>(null);

  const clampCols = (n: number) => Math.max(GRID_MIN, Math.min(GRID_MAX, n));
  const cols = clampCols(baseCols + zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    baseColsRef.current = baseCols;
  }, [baseCols]);

  // Restore the saved density delta once.
  useEffect(() => {
    const saved = Number(localStorage.getItem("pulsar_grid_zoom") ?? "0");
    if (Number.isFinite(saved)) setZoom(saved);
  }, []);

  // The width-derived default column count (mirrors the old breakpoint grid).
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setBaseCols(w < 640 ? 2 : w < 768 ? 3 : w < 1024 ? 4 : w < 1280 ? 5 : 6);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const flashHud = (n: number) => {
    setColHud(n);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setColHud(null), 900);
  };

  // Step the density by ±1 column, clamped, and persist + show the HUD. Uses
  // refs so rapid consecutive pinch steps compute off the latest value.
  const stepZoom = (dir: number) => {
    const curCols = clampCols(baseColsRef.current + zoomRef.current);
    const nextCols = clampCols(curCols + dir);
    if (nextCols === curCols) return; // already at a limit
    const nextZoom = nextCols - baseColsRef.current;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    localStorage.setItem("pulsar_grid_zoom", String(nextZoom));
    flashHud(nextCols);
  };

  // Native pinch (two-finger) + trackpad pinch (ctrl+wheel). A callback ref
  // (re)binds the listeners whenever the grid element mounts.
  const attachGrid = useCallback((el: HTMLDivElement | null) => {
    if (gridCleanup.current) {
      gridCleanup.current();
      gridCleanup.current = null;
    }
    if (!el) return;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (detailOpenRef.current) return;
      if (e.touches.length === 2) pinchRef.current = dist(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (detailOpenRef.current || e.touches.length !== 2 || pinchRef.current == null) return;
      e.preventDefault(); // we own the pinch; one-finger vertical scroll still works
      const d = dist(e.touches);
      const ratio = d / pinchRef.current;
      if (ratio > 1.25) {
        stepZoom(-1); // spread apart → zoom in → fewer columns
        pinchRef.current = d;
      } else if (ratio < 0.8) {
        stepZoom(1); // pinch together → zoom out → more columns
        pinchRef.current = d;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    let wheelCooldown = 0;
    const onWheel = (e: WheelEvent) => {
      if (detailOpenRef.current || !e.ctrlKey) return; // ctrl+wheel = trackpad pinch
      e.preventDefault();
      const now = e.timeStamp;
      if (now - wheelCooldown < 120) return;
      wheelCooldown = now;
      stepZoom(e.deltaY > 0 ? 1 : -1);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    gridCleanup.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  useEffect(() => {
    detailOpenRef.current = detailOpen;
  }, [detailOpen]);

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

  // In the half-page detail (tracklist) mode the grid keeps a fixed, calmer
  // column count; in the main browse view columns come from pinch-zoom (`cols`).
  const gridCols = "grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3";

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
          transition={{ type: "spring", stiffness: 220, damping: 32 }}
          className={`fixed left-0 right-0 z-40 flex flex-col-reverse items-center gap-2 px-4 ${
            detailOpen
              ? `opacity-0 pointer-events-none lg:right-[50vw] lg:opacity-100 lg:pointer-events-auto ${
                  player.current ? "bottom-[72px]" : "bottom-3"
                }`
              : atTop
                ? "top-[178px] opacity-100 md:top-[248px]"
                : `opacity-100 ${player.current ? "bottom-[72px]" : "bottom-3"}`
          }`}
        >
          {/* ONE compact, immersive control row: menu · search · genre · refine.
              Only as wide as its contents → maximal screen real estate. */}
          <div
            className="flex max-w-[94vw] items-center gap-2 rounded-full border border-white/12 p-1.5"
            style={{
              background: "rgba(10,10,18,0.6)",
              backdropFilter: "blur(22px) saturate(170%)",
              WebkitBackdropFilter: "blur(22px) saturate(170%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 32px rgba(0,0,0,0.55)",
            }}
          >
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("pulsar-toggle-sidebar"))}
              aria-label="Open menu"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-white/20 text-star-white/90 transition-transform hover:scale-105 active:scale-95"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <span className="flex flex-col gap-[3px]">
                <span className="h-[2px] w-4 rounded-full bg-current" />
                <span className="h-[2px] w-4 rounded-full bg-current" />
                <span className="h-[2px] w-4 rounded-full bg-current" />
              </span>
            </button>

            {/* search — flexes to fill, shrinking so genre/refine always fit */}
            <div
              className={`search-rainbow min-w-0 flex-1 rounded-full p-[1.5px] transition-opacity duration-300 sm:w-[300px] sm:flex-none md:w-[380px] ${
                atTop ? "opacity-100" : "opacity-[0.6]"
              }`}
            >
              <div
                className="flex w-full items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  backdropFilter: "blur(18px) saturate(180%)",
                  WebkitBackdropFilter: "blur(18px) saturate(180%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
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
                  placeholder="Search artists, albums…"
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
            {/* expandable Genre button — compact on mobile so it always fits */}
            <button
              onClick={() => setShowGenres((v) => !v)}
              aria-expanded={showGenres}
              className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-[10px] sm:tracking-[0.16em] ${
                activeGenre
                  ? "border-[#4aa3ff]/60 bg-[#4aa3ff]/15 text-[#a9d5ff]" // filter active → reminder
                  : "border-star-white/15 text-star-white/60 hover:border-star-white/40 hover:text-star-white"
              }`}
            >
              {activeGenre ?? "Genre"}
              <span className={`transition-transform ${showGenres ? "rotate-180" : ""}`}>⌄</span>
            </button>
            <button
              onClick={() => setShowRefine((v) => !v)}
              aria-expanded={showRefine}
              className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-[10px] sm:tracking-[0.2em] ${
                refineActive
                  ? "border-[#4aa3ff]/60 bg-[#4aa3ff]/15 text-[#a9d5ff]" // filter active → reminder
                  : showRefine
                    ? "border-star-white/40 bg-star-white/[0.06] text-star-white"
                    : "border-star-white/15 text-star-white/50 hover:border-star-white/40 hover:text-star-white"
              }`}
            >
              Refine
              {refineActive && <span className="h-1 w-1 rounded-full bg-[#4aa3ff]" />}
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
                <div
                  className="mx-auto mb-1 max-w-[92vw] rounded-2xl border border-white/12 p-2.5"
                  style={{
                    background: "rgba(12,12,20,0.96)",
                    backdropFilter: "blur(24px) saturate(160%)",
                    WebkitBackdropFilter: "blur(24px) saturate(160%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 44px rgba(0,0,0,0.6)",
                  }}
                >
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
                <div
                  className="mx-auto mb-1 flex max-w-[92vw] flex-col gap-3 rounded-2xl border border-white/12 p-3"
                  style={{
                    background: "rgba(12,12,20,0.96)",
                    backdropFilter: "blur(24px) saturate(160%)",
                    WebkitBackdropFilter: "blur(24px) saturate(160%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 44px rgba(0,0,0,0.6)",
                  }}
                >
                  {/* view + format — macOS-style segmented controls (sky blue) */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      className="flex items-center gap-0.5 rounded-lg p-1"
                      style={{
                        background: "linear-gradient(160deg, #26262e, #14141a)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 4px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)",
                      }}
                    >
                      {(["latest", ...(hasCharts ? ["streamed"] : []), ...(profile ? ["foryou"] : [])] as ViewMode[]).map(
                        (v) => {
                          const isActive = view === v;
                          return (
                            <button
                              key={v}
                              onClick={() => {
                                setView(v);
                                resetPage();
                              }}
                              className="relative rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors"
                            >
                              {isActive && (
                                <motion.span
                                  layoutId="view-active"
                                  className="absolute inset-0 rounded-md"
                                  style={{
                                    background: "linear-gradient(160deg, #8cc6ff, #3f9bff)",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.5)",
                                  }}
                                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                                />
                              )}
                              <span className={`relative ${isActive ? "text-void" : "text-[#a9d5ff]"}`}>
                                {v === "latest" ? "Latest" : v === "streamed" ? "Most Streamed" : "For You"}
                              </span>
                            </button>
                          );
                        }
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
                      className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8cc6ff]/80 transition-colors hover:text-[#a9d5ff]"
                    >
                      {profile ? "Retake quiz →" : "Take quiz →"}
                    </button>
                  </div>

                  {/* labels */}
                  {labels.length > 0 && (
                    <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto">
                      <span className="flex-shrink-0 pr-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8cc6ff]/70">
                        Label
                      </span>
                      <button
                        onClick={() => {
                          setActiveLabel(null);
                          resetPage();
                        }}
                        className={`flex-shrink-0 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                          activeLabel === null
                            ? "bg-[#4aa3ff] text-void shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                            : "bg-white/[0.06] text-[#a9d5ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-white/[0.1] hover:text-white"
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
                          className={`flex-shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                            activeLabel === l
                              ? "bg-[#4aa3ff] text-void shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                              : "bg-white/[0.06] text-[#a9d5ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-white/[0.1] hover:text-white"
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

          {/* feature reel — LAST child so, in this flex-col-reverse column, it
              renders at the TOP of the block: neatly between the Pulsar header
              and the search pill. Only while resting at the top; fades on scroll. */}
          <AnimatePresence>
            {atTop && !detailOpen && !searching && (
              <motion.div
                key="reel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden pb-1"
              >
                <FeatureReel />
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
            ref={attachGrid}
            animate={gridControls}
            className={`grid grid-flow-dense gap-[13px] px-[13px] md:gap-[21px] md:px-[21px] ${
              detailOpen ? gridCols : ""
            }`}
            style={
              detailOpen
                ? undefined
                : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, touchAction: "pan-y" }
            }
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

        {/* pinch-to-zoom density readout — brief, iOS Photos style */}
        <AnimatePresence>
          {colHud != null && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none fixed left-1/2 top-1/2 z-[55] -translate-x-1/2 -translate-y-1/2"
            >
              <div
                className="flex flex-col items-center gap-2 rounded-2xl px-6 py-4"
                style={{
                  background: "rgba(10,10,18,0.72)",
                  backdropFilter: "blur(22px) saturate(170%)",
                  WebkitBackdropFilter: "blur(22px) saturate(170%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 16px 44px rgba(0,0,0,0.6)",
                }}
              >
                <div
                  className="grid gap-[3px]"
                  style={{ gridTemplateColumns: `repeat(${colHud}, 1fr)` }}
                >
                  {Array.from({ length: colHud * 2 }).map((_, k) => (
                    <span key={k} className="h-2.5 w-2.5 rounded-[3px] bg-star-white/85" />
                  ))}
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-star-white/70">
                  {colHud} across
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
