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
  Dna,
  Pause,
  Loader2,
  ArrowDown,
} from "lucide-react";
import Link from "next/link";
import { Artwork } from "./Artwork";
import { useScrollLock } from "@/lib/useScrollLock";
import { useDialog } from "@/lib/useDialog";
import { useBackClose } from "@/lib/useBackClose";
import { useYouTubePlayer } from "@/lib/useYouTubePlayer";
import { youtubeSearchUrl } from "@/lib/samples-media";
import { Portal } from "./Portal";
import { usePlayer } from "./player/PlayerProvider";
import { MiniPlayer } from "./player/MiniPlayer";
import { SampleGraph } from "./SampleGraph";
import { relatedSongs } from "@/lib/samples-graph";
import { parseCredits, type Credit } from "@/lib/credits";
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

/**
 * A preview-playable stand-in for a record that isn't in the feed. The player
 * resolves audio by artist + title, so this is all it needs; the id is stable
 * so the same record shows as playing wherever it appears.
 */
function previewRelease(artist: string, title: string, artwork: string, year: string | null): Release {
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `sample:${slug(artist)}:${slug(title)}`,
    artist,
    title,
    type: "single",
    artwork_url: artwork,
    release_date: year && /^\d{4}$/.test(year) ? `${year}-01-01` : "1900-01-01",
    genre: null,
    tags: [],
    mood: null,
    spotify: null,
    apple_music: null,
    tidal: null,
    soundcloud: null,
    youtube_music: null,
    boomplay: null,
    created_at: new Date(0).toISOString(),
    curator_note: null,
  };
}

/** One record in the pair: cover, title, artist · year, its timing mark, and a play key. */
function PairRow({
  release,
  year,
  isSubject,
  player,
  mark,
  onMarkJump,
}: {
  release: Release;
  year: string | null;
  isSubject: boolean;
  player: ReturnType<typeof usePlayer>;
  mark: number | null;
  onMarkJump?: () => void;
}) {
  const isThis = player.current?.id === release.id;
  const playingThis = isThis && player.playing;
  const loadingThis = isThis && player.loading;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md ring-1 ring-white/10" data-playing={playingThis ? "true" : undefined}>
        <Artwork src={release.artwork_url} artist={release.artist} title={release.title} sizes="48px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold leading-tight text-ink">{release.title}</p>
        <p className="truncate text-[11.5px] text-ink-400">
          {release.artist}
          {year ? <span className="text-ink-600"> · {year}</span> : null}
          {isSubject ? <span className="text-ink-600"> · this track</span> : null}
        </p>
        {mark != null && (
          <button
            onClick={onMarkJump}
            className="mt-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-lcd hover:bg-lcd/10"
            style={{ background: "rgba(11,20,16,0.9)", textShadow: "0 0 5px rgba(126,217,174,0.45)" }}
            title="Marked by a listener on this device — jump there on YouTube"
          >
            ▶ {fromSeconds(mark)}
          </button>
        )}
      </div>
      <button
        onClick={() => (isThis ? player.toggle() : player.play(release))}
        aria-label={`${playingThis ? "Pause" : "Play preview of"} ${release.title}`}
        className={`flex h-10 w-11 flex-shrink-0 items-center justify-center rounded-[10px] border shadow-key transition-[box-shadow,transform] active:translate-y-px active:shadow-keyed ${
          playingThis ? "border-[#b84516] bg-transport text-deck" : "border-chrome-700/70 bg-deck-600 text-ink"
        }`}
      >
        {loadingThis ? (
          <Loader2 size={16} className="animate-spin" />
        ) : playingThis ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} className="ml-0.5" fill="currentColor" />
        )}
      </button>
    </div>
  );
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
  const [, setState] = useState<"idle" | "loading" | "none">("idle");
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
    ? "bg-sony/20 text-sony"
    : isCovers
      ? "bg-lcd/20 text-lcd"
      : isRemix
        ? "bg-vu/20 text-vu"
        : "bg-tps/20 text-tps";
  const badgeLabel =
    sample.role === "samples" ? (sample.partial ? "Interpolation" : "Direct sample")
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

  const player = usePlayer();
  const [showVideo, setShowVideo] = useState(false);
  const hasVideo = Boolean(videoId || subjectVideoId);

  // Which record is the newer one that takes, and which is the source.
  const subjectTakes = sample.role === "samples" || sample.role === "covers" || sample.role === "remixOf";
  const otherArtist = sample.artist ?? baseArtist;
  const otherCover =
    cover ?? `/api/artwork?artist=${encodeURIComponent(otherArtist)}&title=${encodeURIComponent(sample.title)}`;
  const subjectSide = {
    release: previewRelease(subject.artist, subject.title, subject.artwork_url, null),
    year: null as string | null,
    isSubject: true,
  };
  const otherSide = {
    release: previewRelease(otherArtist, sample.title, otherCover, sample.year),
    year: sample.year,
    isSubject: false,
  };
  const top = subjectTakes ? subjectSide : otherSide;
  const bottom = subjectTakes ? otherSide : subjectSide;
  const topSide: "subject" | "other" = subjectTakes ? "subject" : "other";
  const bottomSide: "subject" | "other" = subjectTakes ? "other" : "subject";
  const markFor = (side: "subject" | "other") => (side === "subject" ? mark.inSong : mark.inSource) ?? null;
  const topMark = markFor(topSide);
  const bottomMark = markFor(bottomSide);

  const isSampleRole = sample.role === "samples" || sample.role === "sampledBy";
  const connector = isSampleRole
    ? sample.partial ? "interpolates (replayed, not lifted)" : "samples"
    : isCovers ? "covers" : "remixes";
  const connectorTone = isSampleRole ? "text-sony" : isCovers ? "text-lcd" : "text-sport";
  // The API fills `description` with boilerplate ("Samples “X” by Y") when it
  // has nothing specific; that just repeats the rows above. Keep real notes.
  const note = /^(Samples|Sampled in|Covers|Covered by|Remix of|Remixed in) \u201C/.test(sample.description)
    ? null
    : sample.description;

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
            ? "radial-gradient(40% 40% at 15% 0%, rgba(242,102,44,0.5), transparent 70%)"
            : isCovers
              ? "radial-gradient(40% 40% at 15% 0%, rgba(126,217,174,0.45), transparent 70%)"
              : isRemix
                ? "radial-gradient(40% 40% at 15% 0%, rgba(255,206,10,0.45), transparent 70%)"
                : "radial-gradient(40% 40% at 15% 0%, rgba(78,134,199,0.45), transparent 70%)",
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
          {sample.partial && sample.role !== "samples" && (
            <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-ink/55">
              Interpolation
            </span>
          )}
          {catalogHit && (
            <Link
              href={`/release/${catalogHit.id}`}
              className="relative -my-2 rounded-full border border-tps/40 bg-tps/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-tps transition-colors hover:bg-tps/20 before:absolute before:inset-[-6px] before:content-['']"
              title="This record is in the Pulsar catalog"
            >
              In catalog ↗
            </Link>
          )}

        </div>

        {/* ── The pair, WhoSampled-style ──────────────────────────────
            The song that does the sampling on top, the record it takes from
            below, joined by what kind of connection it is — each with its own
            play key. This card used to be a single YouTube player that needed
            a resolved video id; when none resolved (no API key, spent quota,
            no upload) the whole card became a "Find it on YouTube" box and you
            couldn't hear either record in the app. The keys play Pulsar's
            30-second previews through the main player, which need no key. */}
        <div className="mt-3 overflow-hidden rounded-xl border border-chrome-700/50 bg-black/25">
          <PairRow
            {...top}
            player={player}
            mark={topMark}
            onMarkJump={topMark != null ? () => jumpTo(topSide, topMark) : undefined}
          />
          <div className="flex items-center gap-2 border-y border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-deck-600 text-ink-400">
              <ArrowDown size={11} />
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${connectorTone}`}>
              {connector}
            </span>
          </div>
          <PairRow
            {...bottom}
            player={player}
            mark={bottomMark}
            onMarkJump={bottomMark != null ? () => jumpTo(bottomSide, bottomMark) : undefined}
          />
        </div>

        {/* What's actually taken, when the catalogue says — the "element" line. */}
        {note && <p className="mt-2 px-0.5 text-[11px] leading-snug text-ink-400">{note}</p>}

        {/* ── Full tracks, on YouTube ──────────────────────────────────
            Optional, and the only place timing marks are captured: a moment
            inside a 30-second preview isn't a moment in the song. */}
        {hasVideo ? (
          <div className="mt-3">
            <button
              onClick={() => setShowVideo((v) => !v)}
              aria-expanded={showVideo}
              className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400 transition-colors hover:text-ink"
            >
              <span className="flex items-center gap-1.5">
                <Youtube size={13} className="text-[#e23b2e]" /> Watch full tracks · mark the timing
              </span>
              <span className={`transition-transform ${showVideo ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {showVideo && (
              <>
                <div className="mt-2 flex rounded-[10px] border border-white/10 bg-black/30 p-1">
                  {(
                    [
                      { id: "other" as const, label: otherLabel(sample.role), enabled: Boolean(videoId) },
                      { id: "subject" as const, label: "This track", enabled: Boolean(subjectVideoId) },
                    ]
                  ).filter((x) => x.enabled).map((x) => (
                    <button
                      key={x.id}
                      onClick={() => {
                        setSide(x.id);
                        setPlaying(true);
                      }}
                      aria-pressed={side === x.id}
                      className={`flex-1 truncate rounded-[8px] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                        side === x.id ? "bg-deck-600 text-ink shadow-key" : "text-ink-400 hover:text-ink"
                      }`}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  {!playing ? (
                    <button
                      onClick={() => activeVideoId && setPlaying(true)}
                      disabled={!activeVideoId}
                      className="group relative h-full w-full disabled:cursor-default"
                      aria-label={`Play ${onOther ? sample.title : subject.title} on YouTube`}
                    >
                      {activeVideoId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`https://i.ytimg.com/vi/${activeVideoId}/hqdefault.jpg`} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-ink/25">
                          <Disc3 size={30} />
                        </span>
                      )}
                      {activeVideoId && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/40 backdrop-blur transition-transform group-hover:scale-110">
                            <Play size={18} className="ml-0.5 text-white" fill="currentColor" />
                          </span>
                        </span>
                      )}
                    </button>
                  ) : yt.status === "unavailable" ? (
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
              </>
            )}
          </div>
        ) : null}

        {/* timestamps + actions */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {showVideo && (
          <button
            onClick={markNow}
            disabled={!playing}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-35 ${
              flash
                ? "bg-lcd/25 text-lcd"
                : "border border-white/15 text-ink/60 hover:border-white/40 hover:text-ink"
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
          )}

          <button
            onClick={() => setManual((v) => !v)}
            aria-expanded={manual}
            className="flex min-h-8 items-center gap-1.5 rounded-full border border-white/15 px-2.5 text-[10px] font-bold uppercase tracking-wide text-ink-400 hover:border-white/40 hover:text-ink"
            title="Type where the sample lands in each track"
          >
            <Pencil size={11} /> Add timing
          </button>

          {/* Always a way out to YouTube: the exact video when one is pinned,
              a search for the record when not. The old branch rendered nothing
              at all in the second case and left the card with no action. */}
          <a
            href={
              videoId
                ? `https://www.youtube.com/watch?v=${videoId}${
                    mark.inSource != null ? `&t=${Math.floor(mark.inSource)}` : ""
                  }`
                : youtubeSearchUrl(sample.artist ?? baseArtist, sample.title)
            }
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 rounded-full bg-[#ff0000]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#e23b2e] hover:bg-[#ff0000]/25"
          >
            <Youtube size={12} /> {videoId ? "Open on YouTube" : "Find on YouTube"}
          </a>
        </div>

        {/* manual entry — the fallback when there's no playhead to read */}
        {manual && (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink/45">
              <Clock size={11} className="mt-0.5 flex-shrink-0" />
              No open database publishes sample timings, so they&rsquo;re marked here by ear and
              saved on this device.
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide text-sony">
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
                  className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-2 font-mono text-[12px] text-ink placeholder:text-ink/25 focus:border-sony/60 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide text-tps">
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
                  className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-2 py-2 font-mono text-[12px] text-ink placeholder:text-ink/25 focus:border-tps/60 focus:outline-none"
                />
              </label>
            </div>
            <button
              onClick={() => setManual(false)}
              className="mt-2.5 w-full rounded-lg border border-white/15 py-2 text-[10px] font-bold uppercase tracking-widest text-ink/60 hover:text-ink"
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
  onLookup,
}: {
  subject: SampleSubject | null;
  samples: SampleRef[];
  onClose: () => void;
  releases?: Release[];
  /** When provided, related tracks navigate to that song's breakdown. */
  onLookup?: (artist: string, title: string) => void;
}) {
  const [graphOpen, setGraphOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Resolved once here rather than per card — every card's "This track" side
  // plays the same video, and the lookup is a scrape.
  const [subjectVideoId, setSubjectVideoId] = useState<string | null>(null);
  useScrollLock(Boolean(subject));
  // This overlay opens OVER the release panel, in its own portal. Without these
  // it wasn't part of the overlay stack: Escape and Back skipped it and closed
  // the release panel underneath, focus stayed behind it, and the release
  // panel's Tab trap kept keyboard users out of it entirely.
  useBackClose(Boolean(subject), onClose);
  const dialogRef = useDialog<HTMLDivElement>(Boolean(subject), { modal: true });

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

  // Related tracks — songs that share sample DNA (WhoSampled's "related" strip).
  // Pure + cheap, so computed inline (no hook) after the null guard above.
  // Excluding the records already on this page: the sampled source came back
  // as a "related track" that "shares 1 source" — itself — so the same record
  // was listed twice, once as the sample and once as related. Related should
  // mean OTHER songs built on the same DNA.
  const onPage = new Set(
    samples.map((x) => `${(x.artist ?? subject.artist).toLowerCase()}::${x.title.toLowerCase()}`)
  );
  const related = relatedSongs(subject.artist, subject.title, 12)
    .filter((r) => !onPage.has(`${r.artist.toLowerCase()}::${r.title.toLowerCase()}`))
    .slice(0, 6);

  // Credits for the subject — prefer the release's pre-computed credits, else
  // parse the artist + title on the spot (deterministic, keyless).
  const subjectRelease = releases?.find(
    (r) =>
      r.artist.toLowerCase() === subject.artist.toLowerCase() &&
      (r.title.toLowerCase() === subject.title.toLowerCase() ||
        r.clean_title?.toLowerCase() === subject.title.toLowerCase())
  );
  const credits: Credit[] =
    subjectRelease?.credits ?? parseCredits(subject.artist, subject.title).credits;
  const featCredits = credits.filter((c) => c.role === "featured");
  const prodCredits = credits.filter((c) => c.role === "producer");
  const remixCredits = credits.filter((c) => c.role === "remixer");

  const playNode = (artist: string, title: string) => {
    // Open a YouTube tab for the node — quickest "hear the source" path.
    const q = encodeURIComponent(`${artist} ${title}`);
    window.open(`https://www.youtube.com/results?search_query=${q}`, "_blank", "noopener,noreferrer");
  };

  const section = (label: string, list: SampleRef[], keyPrefix: string, offset: number) =>
    list.length > 0 && (
      <>
        <p className="mb-2 mt-5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-ink/40">
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
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={subject ? `Sample breakdown — ${subject.artist}, ${subject.title}` : "Sample breakdown"}
      className="fixed inset-0 z-[58] flex flex-col bg-[#0b0d10]/[0.98] backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:w-1/2"
    >
      {/* header */}
      <div className="relative flex items-center gap-2 border-b border-white/10 px-3 py-3 sm:gap-3 sm:px-4">
        <span
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(80% 100% at 0% 0%, rgba(242,102,44,0.28), transparent 60%)" }}
        />
        <button
          onClick={onClose}
          aria-label="Back"
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-ink/75 hover:border-white/50 hover:text-ink"
        >
          <span className="text-lg leading-none">‹</span>
        </button>
        <div className="relative min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-sony/80">Sample DNA</p>
          <h3 className="truncate text-base font-bold uppercase tracking-tight text-ink">
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
            copied ? "bg-lcd/20 text-lcd" : "text-ink/50 hover:bg-white/10 hover:text-ink"
          }`}
        >
          {copied ? <Check size={15} /> : <Share2 size={15} />}
        </button>
        <button
          onClick={() => setGraphOpen((v) => !v)}
          aria-label="Toggle graph"
          aria-pressed={graphOpen}
          className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            graphOpen ? "bg-sony/20 text-sony" : "text-ink/50 hover:bg-white/10 hover:text-ink"
          }`}
        >
          <GitFork size={15} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-white/10 hover:text-ink"
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
            <p className="truncate text-lg font-bold leading-tight text-ink">{subject.title}</p>
            <p className="truncate text-sm text-ink/55">{subject.artist}</p>
            <p className="mt-1 text-[11px] text-ink/40">
              {contains.length > 0 && `${contains.length} sample${contains.length > 1 ? "s" : ""}`}
              {contains.length > 0 && sampledIn.length > 0 && " · "}
              {sampledIn.length > 0 && `sampled in ${sampledIn.length}`}
              {(covers.length > 0 || coveredBy.length > 0) && " · covers"}
              {(remixOf.length > 0 || remixedBy.length > 0) && " · remixes"}
            </p>
            {(featCredits.length > 0 || prodCredits.length > 0 || remixCredits.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {featCredits.map((c) => (
                  <span key={`f-${c.slug}`} className="rounded-full bg-lcd/[0.12] px-2 py-0.5 text-[9px] font-bold text-lcd">
                    feat. {c.name}
                  </span>
                ))}
                {prodCredits.map((c) => (
                  <span key={`p-${c.slug}`} className="rounded-full bg-sony/[0.12] px-2 py-0.5 text-[9px] font-bold text-sony">
                    prod. {c.name}
                  </span>
                ))}
                {remixCredits.map((c) => (
                  <span key={`r-${c.slug}`} className="rounded-full bg-tps/[0.12] px-2 py-0.5 text-[9px] font-bold text-tps">
                    {c.name} remix
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Related tracks — shared sample DNA ── */}
        {related.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-ink/40">
              <Dna size={11} className="text-lcd/70" /> Related tracks
            </p>
            <div className="flex flex-wrap gap-2">
              {related.map((r) => (
                <button
                  key={`${r.artist}-${r.title}`}
                  onClick={() =>
                    onLookup ? onLookup(r.artist, r.title) : playNode(r.artist, r.title)
                  }
                  className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left transition-colors hover:border-lcd/40 hover:bg-lcd/[0.08]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-ink group-hover:text-ink">
                      {r.title}
                    </span>
                    <span className="block truncate text-[9px] text-ink/45">{r.artist}</span>
                  </span>
                  {r.sharedSources.length > 0 && (
                    <span className="flex-shrink-0 rounded-full bg-lcd/15 px-1.5 py-0.5 text-[8px] font-bold text-lcd">
                      {r.sharedSources.length} shared
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Force-directed sample DNA graph, on demand ──
            It used to open by default and pushed every actual connection below
            the fold on a phone. The cards are the point; the graph is a lens. */}
        {graphOpen && (
          <div className="mb-5">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-ink/40">
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

        <p className="mt-6 text-center text-[10px] leading-relaxed text-ink/30">
          Connections from a hand-checked catalog + MusicBrainz · 30-second previews from the stores.
          <br />
          Timings are marked by listeners on the full track — open{" "}
          <span className="text-ink/50">Watch full tracks</span> and hit Mark this moment.
        </p>
      </div>
      {/* On phones this overlay covers the main transport, so a preview started
          from a card would play with nothing on screen to pause it. The panel
          carries its own, as the Selector does. */}
      <div className="flex-shrink-0 border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] empty:hidden">
        <MiniPlayer />
      </div>
    </motion.div>
    </Portal>
  );
}
