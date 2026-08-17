"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Play,
  Disc3,
  ArrowDownRight,
  ArrowUpRight,
  Youtube,
  Clock,
  GitFork,
  Share2,
  Check,
  Crosshair,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { Artwork } from "./Artwork";
import { useScrollLock } from "@/lib/useScrollLock";
import { useYouTubePlayer } from "@/lib/useYouTubePlayer";
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

/** What to call the connected record, given which way the relationship runs. */
function otherLabel(role: RelationRole): string {
  switch (role) {
    case "samples":
      return "The source";
    case "sampledBy":
      return "The flip";
    case "covers":
      return "The original";
    case "coveredBy":
      return "The cover";
    default:
      return "The remix";
  }
}

/**
 * One sample relationship, as an A/B comparison.
 *
 * The thing WhoSampled is actually loved for is hearing both records back to
 * back at the exact moment the sample lands. That's what this card is: a single
 * player with a two-way switch, plus one-tap timestamp capture off the live
 * playhead. Everything else — three columns of thumbnails fighting for room on
 * a 390px phone — was noise.
 */
function SampleCard({
  sample,
  index,
  baseArtist,
  subject,
  subjectVideoId,
  releases,
}: {
  sample: SampleRef;
  index: number;
  baseArtist: string;
  subject: SampleSubject;
  subjectVideoId: string | null;
  releases?: Release[];
}) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "none">("idle");
  const [playing, setPlaying] = useState(false);
  const [side, setSide] = useState<"other" | "subject">("other");
  const [manual, setManual] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // The record's own cover: Cover Art Archive when the MusicBrainz recording
  // id resolves to one, iTunes proxy otherwise (built into <Artwork>).
  const [cover, setCover] = useState<string | null>(null);

  // Resolving a YouTube id means scraping a search page. Doing that for every
  // card the moment the panel opens fired a dozen slow requests at once and
  // made the whole thing feel broken; now a card only asks once it's near the
  // viewport.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [near]);

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
  const key = markKey(subject.title, sample.title);
  const [mark, setMark] = useState<SampleMark>({});
  useEffect(() => {
    setMark(readMarks()[key] ?? {});
  }, [key]);

  const saveMark = useCallback(
    (patch: SampleMark) => {
      writeMark(key, patch);
      setMark((m) => ({ ...m, ...patch }));
    },
    [key]
  );

  useEffect(() => {
    if (!near) return;
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
  }, [sample.artist, sample.title, baseArtist, near]);

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

  // ── the A/B player ────────────────────────────────────────────
  const onOther = side === "other";
  const activeVideoId = onOther ? videoId : subjectVideoId;
  const activeMark = onOther ? mark.inSource : mark.inSong;
  const activeStart = activeMark ?? toSeconds(onOther ? sample.timestamp : null) ?? 0;
  const yt = useYouTubePlayer(activeVideoId, playing, activeStart);

  const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

  /** Capture the live playhead for whichever side is showing. */
  const markNow = () => {
    const t = yt.currentTime();
    if (t == null) {
      setManual(true);
      return;
    }
    saveMark(onOther ? { inSource: t } : { inSong: t });
    setFlash(fromSeconds(t));
    window.setTimeout(() => setFlash(null), 1800);
  };

  /** Jump the player to a mark — switching sides first if need be. */
  const jumpTo = (target: "other" | "subject", seconds: number) => {
    if (side !== target) setSide(target);
    setPlaying(true);
    // A side switch reloads the video; seek once it's had a moment to swap.
    window.setTimeout(() => yt.seek(seconds), side === target ? 0 : 700);
  };

  // If the sampled/original track is itself in the loaded catalog, cross-link
  // to its release page — samples as a doorway into discovery, not a dead end.
  const normKey = (a: string, t: string) => `${a} ${t}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const catalogHit = releases?.find(
    (r) => normKey(r.artist, r.title) === normKey(sample.artist ?? baseArtist, sample.title)
  );

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + Math.min(index, 6) * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
      <div className="relative p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
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

        {/* the record itself — cover stays small so the title always has room */}
        <div className="mt-3 flex items-start gap-3">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 sm:h-16 sm:w-16">
            <Artwork
              src={
                cover ??
                `/api/artwork?artist=${encodeURIComponent(sample.artist ?? baseArtist)}&title=${encodeURIComponent(sample.title)}`
              }
              artist={sample.artist ?? baseArtist}
              title={sample.title}
              sizes="64px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight text-star-white">{sample.title}</p>
            {sample.artist && (
              <p className="truncate text-[12px] text-star-white/55">{sample.artist}</p>
            )}
            <p className="mt-1 text-[11px] leading-snug text-star-white/45">{sample.description}</p>
          </div>
        </div>

        {/* ── A/B switch: hear both records without leaving the card ── */}
        <div className="mt-3 flex rounded-full border border-white/10 bg-black/30 p-1">
          {(
            [
              { id: "other" as const, label: otherLabel(sample.role), enabled: Boolean(videoId) },
              { id: "subject" as const, label: "This track", enabled: Boolean(subjectVideoId) },
            ]
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSide(s.id);
                setPlaying(true);
              }}
              disabled={!s.enabled}
              className={`flex-1 truncate rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-30 ${
                side === s.id && playing
                  ? "bg-neon-violet/25 text-neon-violet"
                  : "text-star-white/50 hover:text-star-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* player — poster until asked for, then the real thing */}
        <div className="mt-2 aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
          {!playing ? (
            <button
              onClick={() => videoId && setPlaying(true)}
              disabled={!videoId}
              className="group relative h-full w-full disabled:cursor-default"
              aria-label={`Play ${sample.title} on YouTube`}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-star-white/25">
                  <Disc3 size={30} className={state === "loading" ? "animate-spin" : ""} />
                </span>
              )}
              {videoId && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/40 backdrop-blur transition-transform group-hover:scale-110">
                    <Play size={18} className="ml-0.5 text-white" fill="currentColor" />
                  </span>
                </span>
              )}
            </button>
          ) : yt.status === "unavailable" ? (
            // No IFrame API (blocked script / offline) — a plain embed still
            // plays, it just can't report a playhead for one-tap marking.
            <iframe
              key={`${activeVideoId}-${activeStart}`}
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1${
                activeStart ? `&start=${Math.floor(activeStart)}` : ""
              }`}
              title={onOther ? sample.title : subject.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div ref={yt.hostRef} className="h-full w-full" />
          )}
        </div>

        {/* timestamps + actions */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {mark.inSong != null && (
            <button
              onClick={() => jumpTo("subject", mark.inSong!)}
              className="rounded-full bg-neon-violet/20 px-2.5 py-1 font-mono text-[10px] text-neon-violet hover:bg-neon-violet/30"
              title={`Sample lands at ${fromSeconds(mark.inSong)} in ${subject.title}`}
            >
              ▶ {fromSeconds(mark.inSong)} in this track
            </button>
          )}
          {mark.inSource != null && (
            <button
              onClick={() => jumpTo("other", mark.inSource!)}
              className="rounded-full bg-neon-blue/20 px-2.5 py-1 font-mono text-[10px] text-neon-blue hover:bg-neon-blue/30"
              title={`Taken from ${fromSeconds(mark.inSource)} in ${sample.title}`}
            >
              ▶ {fromSeconds(mark.inSource)} in {otherLabel(sample.role).toLowerCase()}
            </button>
          )}

          <button
            onClick={markNow}
            disabled={!playing}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-35 ${
              flash
                ? "bg-neon-green/25 text-neon-green"
                : "border border-white/15 text-star-white/60 hover:border-white/40 hover:text-star-white"
            }`}
            title={
              playing
                ? "Mark the moment you're hearing right now"
                : "Play the track first, then mark the moment"
            }
          >
            <Crosshair size={11} />
            {flash ? `Marked ${flash}` : "Mark this moment"}
          </button>

          <button
            onClick={() => setManual((v) => !v)}
            aria-label="Type timestamps by hand"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-star-white/45 hover:border-white/40 hover:text-star-white"
            title="Type timestamps by hand"
          >
            <Pencil size={10} />
          </button>

          {videoId && (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}${
                mark.inSource != null ? `&t=${Math.floor(mark.inSource)}` : ""
              }`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 rounded-full bg-[#ff0000]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ff5b5b] hover:bg-[#ff0000]/25"
            >
              <Youtube size={12} /> YouTube
            </a>
          )}
          {state === "none" && (
            <span className="text-[10px] text-star-white/30">No video found</span>
          )}
        </div>

        {/* manual entry — the fallback when there's no playhead to read */}
        {manual && (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-star-white/45">
              <Clock size={11} className="mt-0.5 flex-shrink-0" />
              No open database publishes sample timings, so they&rsquo;re marked here by ear and
              saved on this device.
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide text-neon-violet">
                  Lands in this track
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
                  className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-2 font-mono text-[12px] text-star-white placeholder:text-star-white/25 focus:border-neon-violet/60 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide text-neon-blue">
                  Taken from at
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
                  className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-2 font-mono text-[12px] text-star-white placeholder:text-star-white/25 focus:border-neon-blue/60 focus:outline-none"
                />
              </label>
            </div>
            <button
              onClick={() => setManual(false)}
              className="mt-2.5 w-full rounded-lg border border-white/15 py-2 text-[10px] font-bold uppercase tracking-widest text-star-white/60 hover:text-star-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * WhoSampled-style breakdown: the song at the top, then each documented
 * connection as an A/B card you can flip between and timestamp.
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
  const [graphOpen, setGraphOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Resolved once here rather than per card — every card's "This track" side
  // plays the same video, and the lookup is a scrape.
  const [subjectVideoId, setSubjectVideoId] = useState<string | null>(null);
  useScrollLock(Boolean(subject));

  const subjArtist = subject?.artist;
  const subjTitle = subject?.title;
  useEffect(() => {
    if (!subjArtist || !subjTitle) return;
    let cancelled = false;
    fetch(
      `/api/ytvideo?artist=${encodeURIComponent(subjArtist)}&title=${encodeURIComponent(subjTitle)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSubjectVideoId(d?.videoId ?? null);
      })
      .catch(() => {
        /* the A/B switch just stays one-sided */
      });
    return () => {
      cancelled = true;
    };
  }, [subjArtist, subjTitle]);

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

  const section = (label: string, list: SampleRef[], keyPrefix: string, offset: number) =>
    list.length > 0 && (
      <>
        <p className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
          {label}
        </p>
        <div className="space-y-3">
          {list.map((s, i) => (
            <SampleCard
              key={`${keyPrefix}-${i}`}
              sample={s}
              index={offset + i}
              baseArtist={subject.artist}
              subject={subject}
              subjectVideoId={subjectVideoId}
              releases={releases}
            />
          ))}
        </div>
      </>
    );

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 480, damping: 40 }}
      className="fixed inset-0 z-[56] flex flex-col bg-[#07070d]/[0.98] backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:w-1/2"
    >
      {/* header */}
      <div className="relative flex items-center gap-2 border-b border-white/10 px-3 py-3 sm:gap-3 sm:px-4">
        <span
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(80% 100% at 0% 0%, rgba(155,93,229,0.28), transparent 60%)" }}
        />
        <button
          onClick={onClose}
          aria-label="Back"
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-star-white/75 hover:border-white/50 hover:text-star-white"
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
          className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            copied ? "bg-neon-green/20 text-neon-green" : "text-star-white/50 hover:bg-white/10 hover:text-star-white"
          }`}
        >
          {copied ? <Check size={15} /> : <Share2 size={15} />}
        </button>
        <button
          onClick={() => setGraphOpen((v) => !v)}
          aria-label="Toggle graph"
          aria-pressed={graphOpen}
          className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            graphOpen ? "bg-neon-violet/20 text-neon-violet" : "text-star-white/50 hover:bg-white/10 hover:text-star-white"
          }`}
        >
          <GitFork size={15} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {/* subject hero */}
        <div className="mb-4 flex items-center gap-3 sm:gap-4">
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15 sm:h-20 sm:w-20">
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

        {/* ── Force-directed sample DNA graph, on demand ──
            It used to open by default and pushed every actual connection below
            the fold on a phone. The cards are the point; the graph is a lens. */}
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

        {section("What it samples", contains, "c", 0)}
        {section("Where it's sampled", sampledIn, "s", contains.length)}
        {section("Covers", covers, "cv", contains.length + sampledIn.length)}
        {section("Covered by", coveredBy, "cb", contains.length + sampledIn.length + covers.length)}
        {section(
          "Remixes",
          [...remixOf, ...remixedBy],
          "rx",
          contains.length + sampledIn.length + covers.length + coveredBy.length
        )}

        <p className="mt-6 text-center text-[10px] leading-relaxed text-star-white/30">
          Connections from a hand-checked catalog + MusicBrainz · originals played from YouTube.
          <br />
          Timings are marked by listeners — hit{" "}
          <span className="text-star-white/50">Mark this moment</span> while it plays.
        </p>
      </div>
    </motion.div>
    </Portal>
  );
}
