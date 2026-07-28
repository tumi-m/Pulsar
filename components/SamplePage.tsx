"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Play, Disc3, ArrowDownRight, ArrowUpRight, Youtube, Clock } from "lucide-react";
import { Artwork } from "./Artwork";
import { useScrollLock } from "@/lib/useScrollLock";
import { Portal } from "./Portal";

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

const fromSeconds = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Listener-marked sample timecodes.
 *
 * No openly-licensed source publishes where in a track a sample lands —
 * WhoSampled's timings are hand-annotated proprietary data. Rather than
 * fabricate them, we let the person listening mark both ends themselves:
 * where it lands in the new song, and where it was lifted from in the original.
 * Marks are keyed by the pair, so they persist per connection.
 */
const MARK_KEY = "pulsar_sample_marks_v1";

export interface SampleMark {
  /** seconds into the song that contains the sample */
  inSong?: number;
  /** seconds into the original that the sample is taken from */
  inSource?: number;
}

function markKey(subject: string, sampleTitle: string) {
  return `${subject}::${sampleTitle}`.toLowerCase();
}

function readMarks(): Record<string, SampleMark> {
  try {
    return JSON.parse(localStorage.getItem(MARK_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeMark(key: string, mark: SampleMark) {
  try {
    const all = readMarks();
    all[key] = { ...all[key], ...mark };
    localStorage.setItem(MARK_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — the mark just won't persist */
  }
}

/** One sample relationship: fetches its YouTube video, embeds on demand. */
function SampleCard({
  sample,
  index,
  baseArtist,
  subjectTitle,
}: {
  sample: SampleRef;
  index: number;
  baseArtist: string;
  subjectTitle: string;
}) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "none">("idle");
  const [playing, setPlaying] = useState(false);

  // Listener-marked timecodes for this specific connection.
  const key = markKey(subjectTitle, sample.title);
  const [mark, setMark] = useState<SampleMark>({});
  const [marking, setMarking] = useState(false);
  useEffect(() => {
    setMark(readMarks()[key] ?? {});
  }, [key]);

  const saveMark = (patch: SampleMark) => {
    writeMark(key, patch);
    setMark((m) => ({ ...m, ...patch }));
  };

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
              {/* Where it lands in THIS song, and where it came from in the
                  original — both marked by the listener, since no free source
                  publishes them. */}
              {mark.inSong != null && (
                <span
                  className="rounded-full bg-neon-violet/20 px-2 py-0.5 font-mono text-[10px] text-neon-violet"
                  title={`Sample appears at ${fromSeconds(mark.inSong)} in ${subjectTitle}`}
                >
                  in this song {fromSeconds(mark.inSong)}
                </span>
              )}
              {mark.inSource != null && (
                <a
                  href={
                    videoId
                      ? `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(mark.inSource)}`
                      : undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-neon-blue/20 px-2 py-0.5 font-mono text-[10px] text-neon-blue hover:bg-neon-blue/30"
                  title={`Taken from ${fromSeconds(mark.inSource)} in ${sample.title}`}
                >
                  from original {fromSeconds(mark.inSource)}
                </a>
              )}
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
              <button
                onClick={() => setMarking((v) => !v)}
                className="flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-star-white/50 hover:border-white/40 hover:text-star-white"
              >
                <Clock size={10} />
                {mark.inSong != null || mark.inSource != null ? "Edit times" : "Mark times"}
              </button>
            </div>
          </div>
        </div>

        {/* time marking — the honest alternative to inventing timecodes */}
        {marking && (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-[10px] leading-relaxed text-star-white/45">
              No open database publishes sample timings, so mark them yourself while you
              listen — they&rsquo;re saved on this device.
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide text-neon-violet">
                  Appears in this song
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  defaultValue={mark.inSong != null ? fromSeconds(mark.inSong) : ""}
                  placeholder="0:42"
                  onBlur={(e) => {
                    const s = toSeconds(e.target.value.trim());
                    if (s != null) saveMark({ inSong: s });
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1.5 font-mono text-[12px] text-star-white placeholder:text-star-white/25 focus:border-neon-violet/60 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide text-neon-blue">
                  Taken from original at
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  defaultValue={mark.inSource != null ? fromSeconds(mark.inSource) : ""}
                  placeholder="1:15"
                  onBlur={(e) => {
                    const s = toSeconds(e.target.value.trim());
                    if (s != null) saveMark({ inSource: s });
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-1.5 font-mono text-[12px] text-star-white placeholder:text-star-white/25 focus:border-neon-blue/60 focus:outline-none"
                />
              </label>
            </div>
            <button
              onClick={() => setMarking(false)}
              className="mt-2.5 w-full rounded-lg border border-white/15 py-1.5 text-[10px] font-bold uppercase tracking-widest text-star-white/60 hover:text-star-white"
            >
              Done
            </button>
          </div>
        )}

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
  useScrollLock(Boolean(subject));
  if (!subject) return null;
  const contains = samples.filter((s) => s.role === "samples");
  const sampledIn = samples.filter((s) => s.role === "sampledBy");

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 480, damping: 40 }}
      className="fixed inset-0 z-[56] flex flex-col bg-[#07070d]/98 backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:w-1/2"
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
                <SampleCard key={`c-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} />
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
                <SampleCard key={`s-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} />
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
    </Portal>
  );
}
