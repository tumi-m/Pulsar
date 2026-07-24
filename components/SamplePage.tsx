"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Play, Disc3, ArrowDownRight, ArrowUpRight, Youtube } from "lucide-react";
import { Artwork } from "./Artwork";

export interface SampleRef {
  role: "samples" | "sampledBy";
  title: string;
  artist: string | null;
  year: string | null;
  partial: boolean;
  timestamp: string | null; // "m:ss" if a real one is ever known; else null
  description: string;
}

export interface SampleSubject {
  artist: string;
  title: string;
  artwork_url: string;
}

function toSeconds(ts: string | null): number | null {
  if (!ts) return null;
  const parts = ts.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** One sample relationship: fetches its YouTube video, embeds on demand. */
function SampleCard({ sample, index, baseArtist }: { sample: SampleRef; index: number; baseArtist: string }) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "none">("idle");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const res = await fetch(
          `/api/ytvideo?artist=${encodeURIComponent(sample.artist ?? baseArtist)}&title=${encodeURIComponent(sample.title)}`
        );
        const data = await res.json();
        if (cancelled) return;
        setVideoId(data.videoId ?? null);
        setState(data.videoId ? "idle" : "none");
      } catch {
        if (!cancelled) setState("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sample.artist, sample.title, baseArtist]);

  const isSamples = sample.role === "samples";
  const start = toSeconds(sample.timestamp);
  const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
    >
      {/* role glow */}
      <span
        className="pointer-events-none absolute -inset-16 opacity-40"
        style={{
          background: isSamples
            ? "radial-gradient(40% 40% at 15% 0%, rgba(155,93,229,0.5), transparent 70%)"
            : "radial-gradient(40% 40% at 15% 0%, rgba(0,212,255,0.45), transparent 70%)",
        }}
      />
      <div className="relative p-3.5">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] ${
              isSamples ? "bg-neon-violet/20 text-neon-violet" : "bg-neon-blue/20 text-neon-blue"
            }`}
          >
            {isSamples ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
            {isSamples ? "Contains sample" : "Sampled in"}
          </span>
          {sample.partial && (
            <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-star-white/55">
              Partial
            </span>
          )}
          {sample.year && (
            <span className="ml-auto font-mono text-[10px] text-star-white/35">{sample.year}</span>
          )}
        </div>

        <div className="mt-3 flex gap-3">
          {/* video poster / play */}
          <button
            onClick={() => videoId && setPlaying(true)}
            disabled={!videoId}
            className="group relative aspect-video w-32 flex-shrink-0 overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/10 disabled:opacity-60 sm:w-40"
            aria-label={`Play ${sample.title} on YouTube`}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-star-white/25">
                <Disc3 size={26} className={state === "loading" ? "animate-spin" : ""} />
              </span>
            )}
            {videoId && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/40 backdrop-blur transition-transform group-hover:scale-110">
                  <Play size={15} className="ml-0.5 text-white" fill="currentColor" />
                </span>
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight text-star-white">{sample.title}</p>
            {sample.artist && (
              <p className="truncate text-[12px] text-star-white/55">{sample.artist}</p>
            )}
            <p className="mt-1.5 text-[11px] leading-snug text-star-white/45">{sample.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {sample.timestamp && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-star-white/70">
                  ▶ {sample.timestamp}
                </span>
              )}
              {videoId && (
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}${start ? `&t=${start}` : ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-full bg-[#ff0000]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#ff5b5b] hover:bg-[#ff0000]/25"
                >
                  <Youtube size={12} /> YouTube
                </a>
              )}
              {state === "none" && (
                <span className="text-[10px] text-star-white/30">No video found</span>
              )}
            </div>
          </div>
        </div>

        {/* inline embed once played */}
        {playing && videoId && (
          <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg border border-white/10">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1${start ? `&start=${start}` : ""}`}
              title={sample.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * WhoSampled-style breakdown: the song at the top, then each documented sample
 * (what it samples and what samples it) with a playable YouTube original.
 */
export function SamplePage({
  subject,
  samples,
  onClose,
}: {
  subject: SampleSubject | null;
  samples: SampleRef[];
  onClose: () => void;
}) {
  if (!subject) return null;
  const contains = samples.filter((s) => s.role === "samples");
  const sampledIn = samples.filter((s) => s.role === "sampledBy");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 480, damping: 40 }}
      className="fixed inset-0 z-[46] flex flex-col bg-[#07070d]/98 backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:w-1/2"
    >
      {/* header */}
      <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(80% 100% at 0% 0%, rgba(155,93,229,0.28), transparent 60%)" }}
        />
        <button
          onClick={onClose}
          aria-label="Back"
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-star-white/75 hover:border-white/50 hover:text-star-white"
        >
          <span className="text-lg leading-none">‹</span>
        </button>
        <div className="relative min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-neon-violet/80">Sample breakdown</p>
          <h3 className="truncate text-base font-bold uppercase tracking-tight text-star-white">
            {subject.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {/* subject hero */}
        <div className="mb-5 flex items-center gap-4">
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15">
            <Artwork src={subject.artwork_url} artist={subject.artist} title={subject.title} sizes="80px" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight text-star-white">{subject.title}</p>
            <p className="truncate text-sm text-star-white/55">{subject.artist}</p>
            <p className="mt-1 text-[11px] text-star-white/40">
              {contains.length > 0 && `${contains.length} sample${contains.length > 1 ? "s" : ""}`}
              {contains.length > 0 && sampledIn.length > 0 && " · "}
              {sampledIn.length > 0 && `sampled in ${sampledIn.length}`}
            </p>
          </div>
        </div>

        {contains.length > 0 && (
          <>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              What it samples
            </p>
            <div className="space-y-3">
              {contains.map((s, i) => (
                <SampleCard key={`c-${i}`} sample={s} index={i} baseArtist={subject.artist} />
              ))}
            </div>
          </>
        )}

        {sampledIn.length > 0 && (
          <>
            <p className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              Where it's sampled
            </p>
            <div className="space-y-3">
              {sampledIn.map((s, i) => (
                <SampleCard key={`s-${i}`} sample={s} index={i} baseArtist={subject.artist} />
              ))}
            </div>
          </>
        )}

        <p className="mt-6 text-center text-[10px] leading-relaxed text-star-white/30">
          Sample connections via MusicBrainz · originals played from YouTube.
          <br />
          Tap a video to hear exactly where the sample lands.
        </p>
      </div>
    </motion.div>
  );
}
