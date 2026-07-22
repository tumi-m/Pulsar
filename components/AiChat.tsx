"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Play, Plus, Check } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Release[] | null>(null);

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
    <>
      {/* floating AI button (bottom-left) */}
      <button
        onClick={() => setOpen(true)}
        aria-label="AI mood assistant"
        className={`fixed left-5 z-40 flex h-14 items-center gap-2 rounded-full px-4 transition-all duration-300 hover:scale-105 active:scale-95 ${
          current ? "bottom-24" : "bottom-5"
        }`}
        style={{
          background: "linear-gradient(120deg, #9b5de5, #ff5fa2 60%, #ffb347)",
          boxShadow: "0 6px 20px rgba(155,93,229,0.5)",
        }}
      >
        <Sparkles size={20} className="text-white" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">AI</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[58] bg-void/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-x-3 bottom-3 top-16 z-[58] mx-auto flex max-w-lg flex-col overflow-hidden rounded-2xl border border-star-white/12 bg-[#0a0a14]/97 backdrop-blur-xl md:inset-x-auto md:left-1/2 md:w-[32rem] md:-translate-x-1/2"
            >
              <div className="flex items-center justify-between border-b border-star-white/8 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-neon-violet" />
                  <h3 className="text-sm font-bold uppercase tracking-wide text-star-white">
                    Describe a vibe
                  </h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="border-b border-star-white/8 p-4">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
                  }}
                  placeholder="e.g. dreamy chillwave for a late-night drive…"
                  rows={2}
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

              {/* results */}
              <div className="flex-1 overflow-y-auto p-2">
                {result && result.length === 0 && (
                  <p className="p-6 text-center text-sm text-star-white/40">
                    Nothing matched that vibe — try different words or a genre.
                  </p>
                )}
                {(result ?? []).map((r) => {
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function CrateToggle({ release }: { release: Release }) {
  const [inList, setInList] = useState(false);
  useEffect(() => setInList(inPlaylist(release.id)), [release.id]);
  return (
    <button
      onClick={() => setInList(togglePlaylist(release))}
      aria-label={inList ? "Remove from crate" : "Add to crate"}
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-star-white/20 text-star-white/70 hover:border-white/50"
    >
      {inList ? <Check size={14} className="text-neon-green" /> : <Plus size={14} />}
    </button>
  );
}
