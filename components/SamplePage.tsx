"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Play, Disc3, ArrowDownRight, ArrowUpRight, Youtube, Clock, GitFork, Share2, Check } from "lucide-react";
import Link from "next/link";
import { Artwork } from "./Artwork";
import { useScrollLock } from "@/lib/useScrollLock";
import { Portal } from "./Portal";
import { SampleGraph } from "./SampleGraph";
import type { Release } from "@/lib/types";

export type RelationRole = "samples" | "sampledBy" | "covers" | "coveredBy" | "remixOf" | "remixedBy";

export interface SampleRef {
  role: RelationRole;
  title: string;
  artist: string | null;
  year: string | null;
  partial: boolean;
  timestamp: string | null; // "m:ss" if a real one is ever known; else null
  description: string;
  /** MusicBrainz recording id — used by the chain traversal. */
  mbid?: string | null;
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

export function markKey(subject: string, sampleTitle: string) {
  return `${subject}::${sampleTitle}`.toLowerCase();
}

export function readMarks(): Record<string, SampleMark> {
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
  releases,
}: {
  sample: SampleRef;
  index: number;
  baseArtist: string;
  subjectTitle: string;
  releases?: Release[];
}) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "none">("idle");
  const [playing, setPlaying] = useState(false);
  // The record's own cover: Cover Art Archive when the MusicBrainz recording
  // id resolves to one, iTunes proxy otherwise (built into <Artwork>).
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sample.mbid) return;
    fetch(`/api/sample-cover?mbid=${sample.mbid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.url) setCover(d.url);
      })
      .catch(() => {
        /* no CAA cover — iTunes fallback takes over */
      });
    return () => {
      cancelled = true;
    };
  }, [sample.mbid]);

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
  const isCovers = sample.role === "covers" || sample.role === "coveredBy";
  const isRemix = sample.role === "remixOf" || sample.role === "remixedBy";
  const badgeColor = isSamples
    ? "bg-neon-violet/20 text-neon-violet"
    : isCovers
      ? "bg-neon-green/20 text-neon-green"
      : isRemix
        ? "bg-neon-pink/20 text-neon-pink"
        : "bg-neon-blue/20 text-neon-blue";
  const badgeLabel =
    sample.role === "samples" ? "Contains sample"
      : sample.role === "sampledBy" ? "Sampled in"
      : sample.role === "covers" ? "Covers"
      : sample.role === "coveredBy" ? "Covered by"
      : sample.role === "remixOf" ? "Remix of"
      : "Remixed in";
  const BadgeIcon = isSamples || sample.role === "covers" || sample.role === "remixOf"
    ? ArrowDownRight : ArrowUpRight;
  const start = toSeconds(sample.timestamp);
  const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

  // If the sampled/original track is itself in the loaded catalog, cross-link
  // to its release page — samples as a doorway into discovery, not a dead end.
  const normKey = (a: string, t: string) => `${a} ${t}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const catalogHit = releases?.find(
    (r) => normKey(r.artist, r.title) === normKey(sample.artist ?? baseArtist, sample.title)
  );

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
            : isCovers
              ? "radial-gradient(40% 40% at 15% 0%, rgba(69,240,160,0.45), transparent 70%)"
              : isRemix
                ? "radial-gradient(40% 40% at 15% 0%, rgba(255,95,162,0.45), transparent 70%)"
                : "radial-gradient(40% 40% at 15% 0%, rgba(0,212,255,0.45), transparent 70%)",
        }}
      />
      <div className="relative p-3.5">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] ${badgeColor}`}
          >
            <BadgeIcon size={11} />
            {badgeLabel}
          </span>
          {sample.partial && (
            <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-star-white/55">
              Partial
            </span>
          )}
          {catalogHit && (
            <Link
              href={`/release/${catalogHit.id}`}
              className="rounded-full border border-neon-blue/40 bg-neon-blue/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-neon-blue transition-colors hover:bg-neon-blue/20"
              title="This record is in the Pulsar catalog"
            >
              In catalog ↗
            </Link>
          )}
          {sample.year && (
            <span className="ml-auto font-mono text-[10px] text-star-white/35">{sample.year}</span>
          )}
        </div>

        <div className="mt-3 flex gap-3">
          {/* the record's own cover — CAA via /api/sample-cover, iTunes fallback */}
          <div className="relative h-[72px] w-[72px] flex-shrink-0 self-start overflow-hidden rounded-lg ring-1 ring-white/10">
            <Artwork
              src={
                cover ??
                `/api/artwork?artist=${encodeURIComponent(sample.artist ?? baseArtist)}&title=${encodeURIComponent(sample.title)}`
              }
              artist={sample.artist ?? baseArtist}
              title={sample.title}
              sizes="72px"
            />
          </div>
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
  releases,
}: {
  subject: SampleSubject | null;
  samples: SampleRef[];
  onClose: () => void;
  releases?: Release[];
}) {
  const [graphOpen, setGraphOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  useScrollLock(Boolean(subject));
  if (!subject) return null;
  const contains = samples.filter((s) => s.role === "samples");
  const sampledIn = samples.filter((s) => s.role === "sampledBy");
  const covers = samples.filter((s) => s.role === "covers");
  const coveredBy = samples.filter((s) => s.role === "coveredBy");
  const remixOf = samples.filter((s) => s.role === "remixOf");
  const remixedBy = samples.filter((s) => s.role === "remixedBy");

  const playNode = (artist: string, title: string) => {
    // Open a YouTube tab for the node — quickest "hear the source" path.
    const q = encodeURIComponent(`${artist} ${title}`);
    window.open(`https://www.youtube.com/results?search_query=${q}`, "_blank", "noopener,noreferrer");
  };

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
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-neon-violet/80">Sample DNA</p>
          <h3 className="truncate text-base font-bold uppercase tracking-tight text-star-white">
            {subject.title}
          </h3>
        </div>
        <button
          onClick={() => {
            const url = `${window.location.origin}/samples?artist=${encodeURIComponent(subject.artist)}&title=${encodeURIComponent(subject.title)}`;
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }).catch(() => {});
          }}
          aria-label="Copy a link to this sample breakdown"
          title="Copy link to this breakdown"
          className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            copied ? "bg-neon-green/20 text-neon-green" : "text-star-white/50 hover:bg-white/10 hover:text-star-white"
          }`}
        >
          {copied ? <Check size={15} /> : <Share2 size={15} />}
        </button>
        <button
          onClick={() => setGraphOpen((v) => !v)}
          aria-label="Toggle graph"
          className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            graphOpen ? "bg-neon-violet/20 text-neon-violet" : "text-star-white/50 hover:bg-white/10 hover:text-star-white"
          }`}
        >
          <GitFork size={15} />
        </button>
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
              {(covers.length > 0 || coveredBy.length > 0) && " · covers"}
              {(remixOf.length > 0 || remixedBy.length > 0) && " · remixes"}
            </p>
          </div>
        </div>

        {/* ── Force-directed sample DNA graph ── */}
        {graphOpen && (
          <div className="mb-5">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              <GitFork size={11} /> Sample lineage graph
            </p>
            <SampleGraph
              artist={subject.artist}
              title={subject.title}
              onPlayNode={playNode}
            />
          </div>
        )}

        {contains.length > 0 && (
          <>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              What it samples
            </p>
            <div className="space-y-3">
              {contains.map((s, i) => (
                <SampleCard key={`c-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} releases={releases} />
              ))}
            </div>
          </>
        )}

        {sampledIn.length > 0 && (
          <>
            <p className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              Where it&rsquo;s sampled
            </p>
            <div className="space-y-3">
              {sampledIn.map((s, i) => (
                <SampleCard key={`s-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} releases={releases} />
              ))}
            </div>
          </>
        )}

        {covers.length > 0 && (
          <>
            <p className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              Covers
            </p>
            <div className="space-y-3">
              {covers.map((s, i) => (
                <SampleCard key={`cv-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} releases={releases} />
              ))}
            </div>
          </>
        )}

        {coveredBy.length > 0 && (
          <>
            <p className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              Covered by
            </p>
            <div className="space-y-3">
              {coveredBy.map((s, i) => (
                <SampleCard key={`cb-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} releases={releases} />
              ))}
            </div>
          </>
        )}

        {(remixOf.length > 0 || remixedBy.length > 0) && (
          <>
            <p className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
              Remixes
            </p>
            <div className="space-y-3">
              {remixOf.map((s, i) => (
                <SampleCard key={`rx-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} releases={releases} />
              ))}
              {remixedBy.map((s, i) => (
                <SampleCard key={`rb-${i}`} sample={s} index={i} baseArtist={subject.artist} subjectTitle={subject.title} releases={releases} />
              ))}
            </div>
          </>
        )}

        <p className="mt-6 text-center text-[10px] leading-relaxed text-star-white/30">
          Sample connections via MusicBrainz · originals played from YouTube.
          <br />
          Drag the graph nodes · expand any node to trace its own sample DNA.
        </p>
      </div>
    </motion.div>
    </Portal>
  );
}
