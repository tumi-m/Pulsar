"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Play, LayoutGrid, MessagesSquare } from "lucide-react";
import { CrateIcon } from "./CrateIcon";
import type { Release } from "@/lib/types";
import { genreBucket, type GenreBucket } from "@/lib/utils";
import { usePlayer } from "./player/PlayerProvider";
import { togglePlaylist, inPlaylist } from "@/lib/collection";
import { Artwork } from "./Artwork";

interface AiChatProps {
  releases: Release[];
}

// keyword → signal maps (a light, keyless "AI" that reads the vibe)
const MOOD_WORDS: Record<string, string[]> = {
  euphoric: ["happy", "joy", "euphoric", "uplifting", "party", "hype", "celebrate", "bright"],
  melancholic: ["sad", "melancholy", "heartbreak", "cry", "blue", "lonely", "rainy", "moody"],
  energetic: ["energy", "energetic", "workout", "gym", "run", "pump", "fast", "aggressive"],
  ambient: ["ambient", "calm", "relax", "chill", "study", "focus", "sleep", "peaceful"],
  raw: ["raw", "gritty", "angry", "heavy", "loud", "rebellious"],
  cinematic: ["cinematic", "epic", "dramatic", "film", "soundtrack", "grand"],
  hypnotic: ["hypnotic", "trance", "dreamy", "psychedelic", "trippy", "loop"],
  tender: ["tender", "love", "romantic", "soft", "gentle", "intimate", "sweet"],
};

const GENRE_WORDS: Record<GenreBucket, string[]> = {
  "Hip-Hop": ["hip hop", "hip-hop", "rap", "trap", "drill", "boom bap"],
  Electronic: ["electronic", "edm", "house", "techno", "dance", "synth", "disco", "idm"],
  Rock: ["rock", "punk", "grunge", "indie", "shoegaze", "alt", "guitar"],
  Metal: ["metal", "doom", "sludge", "stoner", "hardcore"],
  "Soul / R&B": ["soul", "r&b", "rnb", "funk", "neo-soul"],
  Pop: ["pop", "synth-pop", "bedroom pop"],
  Jazz: ["jazz", "bebop", "fusion", "swing"],
  "Folk / Country": ["folk", "country", "americana", "singer-songwriter", "acoustic"],
};

interface Parsed {
  moods: string[];
  genres: GenreBucket[];
  decades: string[];
  freeText: string;
}

function parse(text: string): Parsed {
  const q = text.toLowerCase();
  const moods = Object.entries(MOOD_WORDS)
    .filter(([, kws]) => kws.some((k) => q.includes(k)))
    .map(([m]) => m);
  const genres = (Object.entries(GENRE_WORDS) as [GenreBucket, string[]][])
    .filter(([, kws]) => kws.some((k) => q.includes(k)))
    .map(([g]) => g);
  const decades: string[] = [];
  for (const d of ["50", "60", "70", "80", "90"]) if (q.includes(`${d}s`)) decades.push(`19${d}`);
  if (q.includes("2000s") || q.includes("00s")) decades.push("200");
  if (q.includes("2010s") || q.includes("10s")) decades.push("201");
  if (q.includes("2020s") || q.includes("20s")) decades.push("202");
  return { moods, genres, decades, freeText: q };
}

function buildList(releases: Release[], p: Parsed): Release[] {
  const words = p.freeText.split(/\s+/).filter((w) => w.length > 3);
  const scored = releases.map((r) => {
    let s = 0;
    if (r.mood && p.moods.includes(r.mood)) s += 3;
    const bucket = genreBucket(r.genre);
    if (bucket && p.genres.includes(bucket)) s += 3;
    if (p.decades.some((d) => r.release_date.startsWith(d))) s += 2;
    const hay = `${r.artist} ${r.title} ${r.genre ?? ""} ${r.label ?? ""}`.toLowerCase();
    for (const w of words) if (hay.includes(w)) s += 1;
    return { r, s };
  });
  return scored
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40)
    .map(({ r }) => r);
}

export function AiChat({ releases }: AiChatProps) {
  const player = usePlayer();
  const { current } = usePlayer();
  // null = closed, "choose" = the left/right picker, "chat" = the describer
  const [view, setView] = useState<"choose" | "chat" | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Release[] | null>(null);

  // The navbar AI button fires "pulsar-ai-activate" → show the chooser first.
  useEffect(() => {
    const activate = () => setView("choose");
    window.addEventListener("pulsar-ai-activate", activate);
    return () => window.removeEventListener("pulsar-ai-activate", activate);
  }, []);

  const close = () => setView(null);
  const chooseSurvey = () => {
    setView(null);
    window.dispatchEvent(new CustomEvent("pulsar-retake-quiz"));
  };

  const run = () => {
    if (!text.trim()) return;
    setResult(buildList(releases, parse(text)));
  };

  // add the whole generated list to the crate
  const addAll = () => {
    (result ?? []).forEach((r) => {
      if (!inPlaylist(r.id)) togglePlaylist(r);
    });
  };

  const suggestions = [
    "dreamy chillwave for a late-night drive",
    "energetic 90s hip-hop for the gym",
    "melancholic indie for a rainy day",
    "euphoric house to dance to",
  ];

  return (
    <AnimatePresence>
      {view && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[58] bg-void/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
            className="fixed left-1/2 top-1/2 z-[58] flex max-h-[80vh] w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 transform-gpu flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0a0a14]/45 backdrop-blur-2xl"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 24px 70px rgba(0,0,0,0.6)" }}
          >
            {view === "choose" ? (
              /* ── left / right choice before entering ── */
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-star-white">
                    How do you want to pick?
                  </h3>
                  <button onClick={close} aria-label="Close" className="text-star-white/50 hover:text-star-white">
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={chooseSurvey}
                    className="flex flex-col items-center gap-2 rounded-xl border border-star-white/12 bg-star-white/[0.03] p-4 text-center transition-colors hover:border-neon-violet/40 hover:bg-neon-violet/[0.06]"
                  >
                    <LayoutGrid size={26} className="text-neon-violet" />
                    <span className="text-[12px] font-bold uppercase tracking-wide text-star-white">
                      Visual Survey
                    </span>
                    <span className="text-[10px] leading-snug text-star-white/40">Tap images ·  no typing</span>
                  </button>
                  <button
                    onClick={() => setView("chat")}
                    className="flex flex-col items-center gap-2 rounded-xl border border-star-white/12 bg-star-white/[0.03] p-4 text-center transition-colors hover:border-neon-blue/40 hover:bg-neon-blue/[0.06]"
                  >
                    <MessagesSquare size={26} className="text-neon-blue" />
                    <span className="text-[12px] font-bold uppercase tracking-wide text-star-white">
                      Chat
                    </span>
                    <span className="text-[10px] leading-snug text-star-white/40">Describe a mood in words</span>
                  </button>
                </div>
              </div>
            ) : (
              /* ── compact chat ── */
              <>
                <div className="flex items-center justify-between gap-3 border-b border-star-white/8 p-3">
                  {/* one-tap switch between Chat and Visual Survey */}
                  <div className="flex items-center gap-1 rounded-full border border-star-white/12 bg-star-white/[0.03] p-0.5">
                    <span className="flex items-center gap-1.5 rounded-full bg-star-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-void">
                      <Sparkles size={12} /> Chat
                    </span>
                    <button
                      onClick={chooseSurvey}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-star-white/60 transition-colors hover:text-star-white"
                    >
                      <LayoutGrid size={12} /> Visual Survey
                    </button>
                  </div>
                  <button onClick={close} aria-label="Close" className="text-star-white/50 hover:text-star-white">
                    <X size={16} />
                  </button>
                </div>

                <div className="p-3.5">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
                    }}
                    placeholder="e.g. dreamy chillwave for a late-night drive…"
                    rows={2}
                    autoFocus
                    className="w-full resize-none rounded-lg border border-star-white/12 bg-star-white/[0.03] p-3 text-sm text-star-white placeholder:text-star-white/35 focus:border-neon-violet/50 focus:outline-none"
                  />
                  {!result && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => setText(s)}
                          className="rounded-full border border-star-white/12 px-2.5 py-1 text-[10px] text-star-white/50 transition-colors hover:border-star-white/30 hover:text-star-white"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={run}
                      className="flex-1 rounded-lg bg-star-white py-2.5 text-[11px] font-bold uppercase tracking-widest text-void transition-transform active:scale-[0.98]"
                    >
                      Build my list
                    </button>
                    {result && result.length > 0 && (
                      <button
                        onClick={addAll}
                        className="rounded-lg border border-neon-green/40 bg-neon-green/10 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-neon-green"
                      >
                        + Crate all
                      </button>
                    )}
                  </div>
                </div>

                {/* results — only when there are any (keeps the card compact) */}
                {result && (
                  <div className="max-h-[42vh] flex-1 overflow-y-auto border-t border-star-white/8 p-2">
                    {result.length === 0 && (
                      <p className="p-6 text-center text-sm text-star-white/40">
                        Nothing matched that vibe — try different words or a genre.
                      </p>
                    )}
                    {result.map((r) => {
                      const isThis = current?.artist === r.artist && current?.title === r.title;
                      return (
                        <div key={r.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-star-white/[0.04]">
                          <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md">
                            <Artwork src={r.artwork_url} artist={r.artist} title={r.title} sizes="44px" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-[13px] font-bold ${isThis ? "text-neon-blue" : "text-star-white"}`}>
                              {r.title}
                            </p>
                            <p className="truncate text-[11px] text-star-white/50">{r.artist}</p>
                          </div>
                          <button
                            onClick={() => player.play(r)}
                            aria-label="Play"
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-star-white text-void"
                          >
                            <Play size={13} className="ml-0.5" fill="currentColor" />
                          </button>
                          <CrateToggle release={r} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-star-white/20 text-star-white/70 hover:border-white/50"
    >
      <CrateIcon size={15} filled={inList} className="text-[#c08a4e]" />
    </button>
  );
}
