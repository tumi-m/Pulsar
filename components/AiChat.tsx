"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { Sparkles, X, Play, Pause, Loader2, LayoutGrid, MessagesSquare, ArrowUp, RotateCcw } from "lucide-react";
import { CrateIcon } from "./CrateIcon";
import type { Release } from "@/lib/types";
import { parse, buildList, resolveGenres, MOOD_WORDS, GENRE_WORDS, type Parsed } from "@/lib/selector";
import type { GenreBucket } from "@/lib/utils";
import { usePlayer } from "./player/PlayerProvider";
import { togglePlaylist, inPlaylist } from "@/lib/collection";
import { Artwork } from "./Artwork";
import { useScrollLock } from "@/lib/useScrollLock";
import { useBackClose } from "@/lib/useBackClose";
import { Portal } from "./Portal";
import { PLATFORMS } from "./platforms";
import { MiniPlayer } from "./player/MiniPlayer";

interface AiChatProps {
  releases: Release[];
}

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

/** One exchange: the prompt, the signals derived from it, and the matches. */
interface Turn {
  id: string;
  prompt: string;
  signals: Parsed;
  results: Release[];
  source: "llm" | "fallback";
  model?: string;
  /** true once the model has re-ranked this turn's shortlist */
  reranked?: boolean;
}

export function AiChat({ releases }: AiChatProps) {
  const player = usePlayer();
  const { current } = usePlayer();
  // null = closed, "choose" = the left/right picker, "chat" = the selector room
  const [view, setView] = useState<"choose" | "chat" | null>(null);
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  // On phones the panel is a fullscreen room; on larger screens a large
  // centered card that fills most of the viewport — this is a conversation,
  // not a dropdown.
  const [isMobile, setIsMobile] = useState(false);
  useScrollLock(Boolean(view));
  useBackClose(Boolean(view), () => setView(null));
  const dragControls = useDragControls();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // The navbar AI button fires "pulsar-ai-activate" → show the chooser first.
  useEffect(() => {
    const activate = () => setView("choose");
    window.addEventListener("pulsar-ai-activate", activate);
    return () => window.removeEventListener("pulsar-ai-activate", activate);
  }, []);

  // Keep the thread pinned to the newest message as it arrives.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  const close = () => setView(null);
  const chooseSurvey = () => {
    setView(null);
    window.dispatchEvent(new CustomEvent("pulsar-retake-quiz"));
  };

  const run = async (raw?: string) => {
    const prompt = (raw ?? text).trim();
    if (!prompt || thinking) return;
    setText("");
    setThinking(true);
    // Agentic path: ask the model to extract structured signals from free
    // text, then feed those into the scorer. Falls back to the keyless keyword
    // matcher instantly if the model is unreachable or unconfigured.
    let parsed = parse(prompt);
    let source: Turn["source"] = "fallback";
    let model: string | undefined;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const llm = await res.json();
        if (llm.source === "llm") {
          source = "llm";
          model = llm.model;
        }
        // Merge LLM signals with the keyword parse (union) so the recommender
        // gets the broadest, most accurate signal set.
        //
        // The model's genres are free-form ("chillwave", "boom bap"), so they
        // MUST be resolved to real buckets rather than cast. Casting them broke
        // scoring both ways: no record could match the genre list, and the
        // mismatch penalty then fired on every record that had a genre — so
        // genre-less records won on coincidental title words.
        const { buckets, leftover } = resolveGenres([
          ...parsed.genres,
          ...((llm.genres ?? []) as string[]),
        ]);
        const moods = uniq([...parsed.moods, ...(llm.moods ?? [])]);
        const genres = uniq(buckets);
        const decades = uniq([...parsed.decades, ...(llm.decades ?? [])]);
        // Unmapped genre words join the free text, where they can still match a
        // record's descriptor tags.
        const freeText = `${parsed.freeText} ${llm.freeText ?? ""} ${leftover.join(" ")}`.trim();
        parsed = { moods, genres, decades, freeText };
      }
    } catch {
      /* timeout / network — use the keyword parse as-is */
    }
    // Refinement: each turn carries the union of every signal so far, so the
    // conversation narrows in instead of starting over — "euphoric house",
    // then "slower and more hypnotic", keeps the house signal.
    const prior = turns[turns.length - 1]?.signals;
    if (prior) {
      parsed = {
        moods: uniq([...prior.moods, ...parsed.moods]),
        genres: uniq([...prior.genres, ...parsed.genres]) as GenreBucket[],
        decades: uniq([...prior.decades, ...parsed.decades]),
        freeText: `${prior.freeText} ${parsed.freeText}`.trim(),
      };
    }
    // Show the scorer's answer immediately — the model's judgement is an
    // improvement on it, not a prerequisite for it.
    const scored = buildList(releases, parsed);
    const turnId = `${Date.now()}-${turns.length}`;
    setTurns((t) => [...t, { id: turnId, prompt, signals: parsed, results: scored, source, model }]);
    setThinking(false);

    // Then ask the model to re-rank the shortlist by how the records actually
    // SOUND against what was asked for. The scorer can only compare strings; it
    // has no idea what any of these records sound like. Any failure leaves the
    // list exactly as it was.
    void rerank(prompt, scored, turnId);
  };

  /**
   * Second pass: the model sees the actual candidates and reorders them.
   * Applied by turn id so a slow response can't overwrite a newer question.
   */
  const rerank = async (prompt: string, scored: Release[], turnId: string) => {
    const head = scored.slice(0, 40);
    if (head.length < 2) return;
    try {
      const res = await fetch("/api/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          candidates: head.map((r) => ({
            artist: r.artist,
            title: r.title,
            genre: r.genre,
            year: r.release_date?.slice(0, 4),
            tags: r.tags,
          })),
        }),
        signal: AbortSignal.timeout(14000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { order: number[] | null; drop?: number[] };
      if (!data.order?.length) return;

      const dropped = new Set(data.drop ?? []);
      const takenIdx = new Set(data.order);
      const reordered = [
        ...data.order.map((i) => head[i]).filter(Boolean),
        // Unjudged candidates keep their relative order behind the ranked ones.
        ...head.filter((_, i) => !takenIdx.has(i) && !dropped.has(i)),
        // Rejected ones go last rather than vanishing, so the match count
        // stays honest and nothing silently disappears.
        ...head.filter((_, i) => dropped.has(i)),
        ...scored.slice(40),
      ];

      setTurns((ts) =>
        ts.map((t) => (t.id === turnId ? { ...t, results: reordered, reranked: true } : t))
      );
    } catch {
      /* timed out or unreachable — the scorer's order stands */
    }
  };

  /** Tap a signal chip on the latest turn to drop it and re-curate instantly. */
  const dropSignal = (kind: "moods" | "genres" | "decades", value: string) => {
    setTurns((ts) => {
      if (!ts.length) return ts;
      const next = [...ts];
      const last = next[next.length - 1];
      const signals = { ...last.signals, [kind]: last.signals[kind].filter((v) => v !== value) };
      next[next.length - 1] = { ...last, signals, results: buildList(releases, signals) };
      return next;
    });
  };

  const reset = () => {
    setTurns([]);
    setText("");
  };

  // add the whole generated list to the crate
  const addAll = (rs: Release[]) => {
    rs.forEach((r) => {
      if (!inPlaylist(r.id)) togglePlaylist(r);
    });
  };

  const suggestions = [
    "dreamy chillwave for a late-night drive",
    "energetic 90s hip-hop for the gym",
    "melancholic indie for a rainy day",
    "euphoric house to dance to",
  ];

  // The pill in the masthead: is the live model actually answering, or are we
  // in keyword mode? Honest status instead of a silent fallback.
  const lastTurn = turns[turns.length - 1];
  const status =
    thinking || !lastTurn
      ? { label: thinking ? "Listening…" : "Standby", color: "#9b5de5" }
      : lastTurn.source === "llm"
        ? { label: lastTurn.model ?? "DeepSeek", color: "#1DB954" }
        : { label: "Keyword mode", color: "#ffb347" };

  return (
    <Portal>
    <AnimatePresence>
      {view && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[58] bg-void/75 backdrop-blur-md"
          />
          <motion.div
            initial={isMobile ? { y: "100%" } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 480, damping: 42 }}
            drag={isMobile ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) close();
            }}
            className="
              fixed inset-x-0 bottom-0 z-[58] flex h-[100dvh] w-full transform-gpu flex-col
              overflow-hidden rounded-t-[26px] border border-white/15 border-b-0
              bg-[#0a0a14]/75 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl
              sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-auto
              sm:max-h-[86dvh] sm:w-[min(94vw,44rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border-b
            "
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 -12px 60px rgba(0,0,0,0.6), 0 24px 70px rgba(0,0,0,0.6)" }}
          >
            {/* aurora backdrop — the "AI" signature, gently drifting */}
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden"
              aria-hidden
            >
              <div
                className="aurora-blob absolute -top-32 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
                style={{ background: "radial-gradient(closest-side, rgba(155,93,229,0.4), rgba(255,95,162,0.2) 55%, transparent)" }}
              />
              <div
                className="aurora-blob absolute -bottom-40 -right-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(closest-side, rgba(74,163,255,0.35), transparent)" }}
              />
            </div>
            {/* drag grabber — mobile only; the sole drag-to-dismiss target so
                scrolling the thread never dismisses the sheet */}
            <div
              onPointerDown={(e) => isMobile && dragControls.start(e)}
              className="relative z-10 flex justify-center py-3 sm:hidden"
              style={{ touchAction: "none" }}
            >
              <span className="h-1.5 w-11 rounded-full bg-white/25" />
            </div>

            {view === "choose" ? (
              /* ── left / right choice before entering ── */
              <div className="relative z-10 p-5 sm:p-6">
                <div className="mb-1 flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{
                        background: "linear-gradient(135deg, #9b5de5, #ff5fa2 60%, #ffb347)",
                        boxShadow: "0 6px 18px rgba(155,93,229,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
                      }}
                    >
                      <Sparkles size={16} className="text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.2em] text-star-white">The Selector</p>
                      <p className="text-[10px] font-medium uppercase tracking-widest text-star-white/40">
                        Curated by DeepSeek
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={close}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={chooseSurvey}
                    className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center transition-all hover:border-neon-violet/50 hover:bg-neon-violet/[0.07]"
                  >
                    <span
                      className="pointer-events-none absolute -inset-8 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      style={{ background: "radial-gradient(50% 50% at 50% 30%, rgba(155,93,229,0.25), transparent 70%)" }}
                    />
                    <span
                      className="relative flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                      style={{
                        background: "linear-gradient(135deg, rgba(155,93,229,0.9), rgba(107,63,175,0.7))",
                        boxShadow: "0 8px 22px rgba(155,93,229,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
                      }}
                    >
                      <LayoutGrid size={24} className="text-white" />
                    </span>
                    <span className="relative text-[13px] font-bold uppercase tracking-wide text-star-white">
                      Visual Survey
                    </span>
                    <span className="relative text-[10px] leading-snug text-star-white/45">
                      Tap images · no typing
                    </span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setView("chat")}
                    className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center transition-all hover:border-neon-blue/50 hover:bg-neon-blue/[0.07]"
                  >
                    <span
                      className="pointer-events-none absolute -inset-8 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      style={{ background: "radial-gradient(50% 50% at 50% 30%, rgba(74,163,255,0.25), transparent 70%)" }}
                    />
                    <span
                      className="relative flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                      style={{
                        background: "linear-gradient(135deg, rgba(74,163,255,0.9), rgba(38,110,214,0.7))",
                        boxShadow: "0 8px 22px rgba(74,163,255,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
                      }}
                    >
                      <MessagesSquare size={24} className="text-white" />
                    </span>
                    <span className="relative text-[13px] font-bold uppercase tracking-wide text-star-white">
                      Chat
                    </span>
                    <span className="relative text-[10px] leading-snug text-star-white/45">
                      Describe a mood in words
                    </span>
                  </motion.button>
                </div>
              </div>
            ) : (
              /* ── the selector room: a real conversation ── */
              <>
                {/* masthead */}
                <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/[0.08] px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: "linear-gradient(135deg, #9b5de5, #ff5fa2 60%, #ffb347)",
                        boxShadow: "0 6px 18px rgba(155,93,229,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
                      }}
                    >
                      <Sparkles size={14} className="text-white" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black uppercase tracking-[0.2em] text-star-white">
                        The Selector
                      </p>
                      {/* honest status: live model vs keyword fallback */}
                      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-star-white/40">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: status.color, boxShadow: `0 0 8px ${status.color}` }}
                        />
                        {status.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={chooseSurvey}
                      aria-label="Switch to the visual survey"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-star-white/50 transition-colors hover:bg-white/10 hover:text-star-white"
                      title="Visual survey"
                    >
                      <LayoutGrid size={15} />
                    </button>
                    {turns.length > 0 && (
                      <button
                        onClick={reset}
                        aria-label="Start the conversation over"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-star-white/50 transition-colors hover:bg-white/10 hover:text-star-white"
                        title="Start over"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                    <button
                      onClick={close}
                      aria-label="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-star-white/50 transition-colors hover:bg-white/10 hover:text-star-white"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* thread */}
                <div
                  ref={scrollRef}
                  className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
                >
                  {turns.length === 0 && !thinking && (
                    <div className="flex h-full min-h-[30dvh] flex-col items-center justify-center gap-3 text-center">
                      <span
                        className="flex h-16 w-16 items-center justify-center rounded-3xl"
                        style={{
                          background: "linear-gradient(135deg, #9b5de5, #ff5fa2 60%, #ffb347)",
                          boxShadow: "0 10px 30px rgba(155,93,229,0.45), inset 0 1px 0 rgba(255,255,255,0.4)",
                        }}
                      >
                        <MessagesSquare size={26} className="text-white" />
                      </span>
                      <p className="text-lg font-black uppercase tracking-[0.18em] text-star-white">
                        What should the room sound like?
                      </p>
                      <p className="max-w-sm text-xs leading-relaxed text-star-white/45">
                        Describe a mood, an era or a genre — then keep talking to refine it.
                        “euphoric house” → “slower, more hypnotic”.
                      </p>
                      <div className="mt-1 flex max-w-md flex-wrap justify-center gap-1.5">
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => run(s)}
                            className="rounded-full border border-star-white/[0.12] px-3 py-1.5 text-[10px] text-star-white/55 transition-colors hover:border-neon-violet/50 hover:bg-neon-violet/10 hover:text-star-white"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {turns.map((t, i) => (
                    <TurnBlock key={i} turn={t} isLast={i === turns.length - 1} onDropSignal={dropSignal} onCrateAll={addAll} current={current} player={player} />
                  ))}

                  {thinking && (
                    <div className="mb-4 flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl"
                        style={{ background: "linear-gradient(135deg, #9b5de5, #ff5fa2 60%, #ffb347)" }}
                      >
                        <Sparkles size={14} className="text-white" />
                      </span>
                      <div className="flex items-end gap-1" aria-label="Thinking">
                        {[0, 1, 2, 3].map((i) => (
                          <motion.span
                            key={i}
                            className="w-1 rounded-full bg-neon-violet"
                            initial={{ height: 6 }}
                            animate={{ height: [6, 18, 6] }}
                            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-star-white/50">Reading the room…</span>
                    </div>
                  )}
                </div>

                {/* Transport for the previews started from the result rows.
                    The global NowPlayingBar is z-50 and this sheet is z-[58] at
                    full height, so the bar is buried whenever the Selector is
                    open — you could start a clip and then have no way to see or
                    control it. This strip gives the panel its own. */}
                <div className="relative z-10 px-3 sm:px-4">
                  <MiniPlayer />
                </div>

                {/* composer */}
                <div className="relative z-10 border-t border-white/[0.08] p-3 pt-2.5 sm:p-4 sm:pt-3">
                  <div className="flex items-end gap-2 rounded-2xl border border-star-white/[0.12] bg-star-white/[0.04] p-2 transition-colors focus-within:border-neon-violet/50">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter sends on desktop (multiline via Shift+Enter); on
                        // touch keyboards Enter should newline, send is a tap.
                        if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                          e.preventDefault();
                          run();
                        }
                      }}
                      placeholder={turns.length ? "Refine it — “slower”, “add sax”, “more 80s”…" : "Describe the vibe — mood, genre, era, anything…"}
                      rows={1}
                      autoFocus
                      className="max-h-28 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-star-white placeholder:text-star-white/35 focus:outline-none"
                    />
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => run()}
                      disabled={thinking || !text.trim()}
                      aria-label="Send"
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-35"
                      style={{
                        background: "linear-gradient(120deg, #9b5de5, #ff5fa2 60%, #ffb347)",
                        boxShadow: "0 4px 14px rgba(155,93,229,0.4)",
                      }}
                    >
                      <ArrowUp size={16} />
                    </motion.button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </Portal>
  );
}

/**
 * One exchange rendered as chat: the user's words as a bubble, the Selector's
 * reply as signal chips + a results list with per-platform deep links.
 */
function TurnBlock({
  turn,
  isLast,
  onDropSignal,
  onCrateAll,
  current,
  player,
}: {
  turn: Turn;
  isLast: boolean;
  onDropSignal: (kind: "moods" | "genres" | "decades", value: string) => void;
  onCrateAll: (rs: Release[]) => void;
  current: ReturnType<typeof usePlayer>["current"];
  player: ReturnType<typeof usePlayer>;
}) {
  // Start at 10 and grow in 10s, so a long list stays browsable
  // instead of flipping between 6 and everything.
  const [visible, setVisible] = useState(10);
  const shown = turn.results.slice(0, visible);
  const chips = [
    ...turn.signals.moods.map((v) => ({ kind: "moods" as const, v, color: "rgba(155,93,229,0.5)" })),
    ...turn.signals.genres.map((v) => ({ kind: "genres" as const, v, color: "rgba(74,163,255,0.5)" })),
    ...turn.signals.decades.map((v) => ({ kind: "decades" as const, v, color: "rgba(255,179,71,0.5)" })),
  ];

  return (
    <div className="mb-5">
      {/* the user's words */}
      <div className="mb-2.5 flex justify-end">
        <p
          className="max-w-[85%] rounded-2xl rounded-br-md border border-neon-violet/25 bg-neon-violet/[0.12] px-3.5 py-2 text-[13px] leading-relaxed text-star-white"
        >
          {turn.prompt}
        </p>
      </div>

      {/* the selector's reply: signals, then matches */}
      {chips.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map(({ kind, v, color }) => (
            <button
              key={`${kind}-${v}`}
              onClick={() => isLast && onDropSignal(kind, v)}
              title={isLast ? `Drop “${v}” and re-curate` : v}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-star-white/80 transition-colors ${
                isLast ? "hover:border-white/40 hover:text-star-white" : "opacity-70"
              }`}
              style={{ borderColor: color, backgroundColor: `${color.slice(0, 7)}1a` }}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {turn.results.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-[13px] text-star-white/50">
          Nothing in the catalog matches that yet — try different words, a genre, or an era.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {shown.map((r) => {
              const isThis = current?.artist === r.artist && current?.title === r.title;
              const links = PLATFORMS.filter((p) => r[p.key]);
              return (
                <div
                  key={r.id}
                  className="group flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2.5 transition-colors hover:border-white/15 hover:bg-white/[0.06] sm:gap-4 sm:p-3"
                >
                  {/* 30-second preview. The play badge used to be
                      opacity-0 group-hover:opacity-100 — on a phone there is no
                      hover, so nothing ever revealed it and the rows looked
                      like static artwork. It is always visible now, and shows
                      real transport state: pause while this row is playing, a
                      spinner while its preview resolves. */}
                  <button
                    onClick={() => (isThis ? player.toggle() : player.play(r))}
                    aria-label={
                      isThis && player.playing ? `Pause ${r.title}` : `Play a preview of ${r.title}`
                    }
                    className="group/art relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl sm:h-[88px] sm:w-[88px]"
                  >
                    <Artwork
                      src={r.artwork_url}
                      artist={r.artist}
                      title={r.title}
                      sizes="(min-width: 640px) 88px, 64px"
                    />
                    <span
                      className={`absolute inset-0 flex items-center justify-center transition-colors ${
                        isThis ? "bg-void/45" : "bg-void/20 group-hover/art:bg-void/50"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm transition-transform group-active/art:scale-90 ${
                          isThis
                            ? "bg-neon-blue/85 text-void"
                            : "bg-void/60 text-star-white ring-1 ring-star-white/40"
                        }`}
                      >
                        {isThis && player.loading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : isThis && player.playing ? (
                          <Pause size={15} fill="currentColor" />
                        ) : (
                          <Play size={15} className="ml-0.5" fill="currentColor" />
                        )}
                      </span>
                    </span>
                  </button>

                  {/* Everything that identifies the record — title, artist,
                      what kind of release it is — plus the service links, in
                      one column. The links used to sit in the same ROW as the
                      title, and on a 390px phone the artwork + five icons +
                      crate button left the title literally zero width: it
                      rendered as a single letter, and the icons still ran off
                      the right edge. Stacked, everything fits and the icons
                      WRAP rather than scroll, so none is ever unreachable. */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[15px] font-bold leading-tight sm:text-[17px] ${isThis ? "text-neon-blue" : "text-star-white"}`}
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {r.title}
                    </p>
                    <p className="truncate text-[13px] font-medium text-star-white/75">{r.artist}</p>
                    <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-star-white/35">
                      {r.type === "ep" ? "EP" : r.type}
                      {r.release_date ? ` · ${r.release_date.slice(0, 4)}` : ""}
                      {r.genre ? ` · ${r.genre}` : ""}
                    </p>

                    {/* Six services have to fit one line inside a ~200px text
                        column on a 390px phone. At 32px they wrapped and left a
                        single orphaned icon on a second row, pushing every row
                        from 120px to 155px. 28px + 6px gaps = 198px — fits,
                        and returns to 32px as soon as there's room. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {links.map((p) => (
                        <a
                          key={p.key}
                          href={r[p.key] as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${r.artist} — ${r.title} on ${p.label}`}
                          aria-label={`Find ${r.title} by ${r.artist} on ${p.label}`}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition-transform hover:scale-110 sm:h-8 sm:w-8 [&>svg]:h-[15px] [&>svg]:w-[15px] sm:[&>svg]:h-4 sm:[&>svg]:w-4"
                          style={{ backgroundColor: `${p.color}1f`, borderColor: `${p.color}45`, color: p.color }}
                        >
                          <p.Icon />
                        </a>
                      ))}
                    </div>
                  </div>

                  <CrateToggle release={r} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            {/* Say which stage produced this order. "Ranked" means the model
                actually judged these records; "DeepSeek" alone means it only
                read the request and the keyword scorer did the ordering. */}
            <p className="text-[10px] font-bold uppercase tracking-widest text-star-white/35">
              {turn.results.length} match{turn.results.length === 1 ? "" : "es"} ·{" "}
              {turn.reranked ? (
                <span className="text-neon-green/70">Ranked by DeepSeek</span>
              ) : turn.source === "llm" ? (
                "DeepSeek"
              ) : (
                "keyword match"
              )}
            </p>
            <div className="flex items-center gap-2">
              {turn.results.length > visible && (
                <button
                  onClick={() => setVisible((v) => v + 10)}
                  className="text-[10px] font-bold uppercase tracking-widest text-star-white/50 hover:text-star-white"
                >
                  +{Math.min(10, turn.results.length - visible)} more
                </button>
              )}
              {visible > 10 && (
                <button
                  onClick={() => setVisible(10)}
                  className="text-[10px] font-bold uppercase tracking-widest text-star-white/35 hover:text-star-white"
                >
                  Less
                </button>
              )}
              <button
                onClick={() => onCrateAll(turn.results)}
                className="rounded-full border border-neon-green/40 bg-neon-green/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neon-green"
              >
                + Crate all
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CrateToggle({ release }: { release: Release }) {
  const [inList, setInList] = useState(false);
  useEffect(() => {
    const sync = () => setInList(inPlaylist(release.id));
    sync();
    window.addEventListener("pulsar-collection-change", sync);
    return () => window.removeEventListener("pulsar-collection-change", sync);
  }, [release.id]);
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("pulsar-crate-picker", { detail: release }))}
      aria-label="Add to a crate"
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-star-white/20 text-star-white/70 hover:border-white/50"
    >
      <CrateIcon size={18} filled={inList} className="text-[#c08a4e]" />
    </button>
  );
}
