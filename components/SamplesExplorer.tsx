"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, AudioLines, Clock, Loader2, Trophy, Sparkles, ExternalLink, ArrowRight } from "lucide-react";
import { Portal } from "./Portal";
import { useScrollLock } from "@/lib/useScrollLock";
import { useBackClose } from "@/lib/useBackClose";
import { SamplePage, readMarks, type SampleRef, type SampleSubject } from "./SamplePage";
import { mostSampledSources, catalogSamplers } from "@/lib/samples-catalog";
import { catalogSongs, type SongKey } from "@/lib/samples-graph";
import type { Release } from "@/lib/types";

/**
 * Samples mode — a dedicated way into the sample graph.
 *
 * Browse first, search second. It used to open onto an empty search box with
 * nothing to look at, which meant you had to already know what you wanted to
 * ask — and if you guessed a track with no documented samples, you got a dead
 * end. The records that keep getting lifted from are right there now, one tap
 * from a full breakdown, which is what makes WhoSampled's front page work.
 *
 * Opened globally via the `pulsar-open-samples` event (navbar button).
 */
export function SamplesExplorer({ releases }: { releases: Release[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [marked, setMarked] = useState<{ subject: string; sample: string; mark: string }[]>([]);
  const [viewing, setViewing] = useState<{ subject: SampleSubject; samples: SampleRef[] } | null>(null);

  useScrollLock(open);
  useBackClose(open, () => setOpen(false));

  const leaders = useMemo(() => mostSampledSources(8), []);
  const picks = useMemo(() => catalogSamplers(10), []);
  const songs = useMemo(() => catalogSongs(), []);

  useEffect(() => {
    const activate = () => setOpen(true);
    window.addEventListener("pulsar-open-samples", activate);
    return () => window.removeEventListener("pulsar-open-samples", activate);
  }, []);

  // The panel covers the right half on desktop; broadcast so the Pulsar
  // letterhead and navbar shift into the space that's still visible.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pulsar-samples-open", { detail: open }));
  }, [open]);

  // Surface everything the listener has already timestamped.
  useEffect(() => {
    if (!open) return;
    const all = readMarks();
    setMarked(
      Object.entries(all).map(([k, v]) => {
        const [subject, sample] = k.split("::");
        const fmt = (s?: number) =>
          s == null ? null : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
        const parts = [
          v.inSong != null ? `in song ${fmt(v.inSong)}` : null,
          v.inSource != null ? `original ${fmt(v.inSource)}` : null,
        ].filter(Boolean);
        return { subject, sample, mark: parts.join(" · ") };
      })
    );
  }, [open]);

  /** Look up a track and go straight into the breakdown — one tap, not two. */
  async function lookup(artist: string, title: string, artwork?: string) {
    setBusy(`${artist}::${title}`);
    setNotFound(false);
    try {
      const res = await fetch(
        `/api/samples?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`
      );
      const data = await res.json();
      const samples: SampleRef[] = Array.isArray(data.samples) ? data.samples : [];
      if (samples.length) {
        setViewing({
          subject: {
            artist,
            title,
            artwork_url:
              artwork ??
              `/api/artwork?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
          },
          samples,
        });
        // Stand down so the breakdown is actually visible. This panel is
        // `fixed inset-0` and fully opaque on a phone; leaving it up rendered
        // the entire breakdown underneath it and nothing appeared to happen —
        // which is exactly the "samples still doesn't work" report.
        setOpen(false);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setBusy(null);
    }
  }

  // Suggestions span BOTH the Pulsar catalogue and every song in the sample
  // graph. Searching "Edwin Birdsong" or "Chic" used to dead-end because those
  // records aren't releases in the grid — they're only ever sources.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as (Release | SongKey)[];
    const seen = new Set<string>();
    const out: (Release | SongKey)[] = [];
    const push = (s: Release | SongKey) => {
      const k = `${s.artist}::${s.title}`.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(s);
    };
    for (const r of releases) {
      if (r.artist.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)) push(r);
    }
    for (const s of songs) {
      if (s.artist.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)) push(s);
    }
    return out.slice(0, 8);
  }, [query, releases, songs]);

  const busyFor = (artist: string, title: string) => busy === `${artist}::${title}`;

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[57] flex flex-col bg-[#07070d]/[0.98] backdrop-blur-2xl lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:w-[min(44vw,560px)] lg:rounded-2xl lg:border lg:border-white/[0.12]"
          >
            {/* header */}
            <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <span
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ background: "radial-gradient(80% 100% at 0% 0%, rgba(155,93,229,0.28), transparent 60%)" }}
              />
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-neon-violet/20 text-neon-violet">
                <AudioLines size={17} />
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-neon-violet/80">
                  Samples mode
                </p>
                <h3 className="truncate text-base font-bold uppercase tracking-tight text-star-white">
                  What&rsquo;s the sample?
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-star-white/50 hover:bg-white/10 hover:text-star-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4">
              {/* search */}
              <div className="flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-2.5">
                <Search size={15} className="flex-shrink-0 text-star-white/45" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setNotFound(false);
                  }}
                  placeholder="Search a song or artist…"
                  aria-label="Search a song or artist"
                  className="min-w-0 flex-1 bg-transparent text-sm text-star-white placeholder:text-star-white/35 focus:outline-none"
                />
                {busy && <Loader2 size={15} className="animate-spin text-neon-violet" />}
              </div>

              {/* catalogue + graph suggestions */}
              {suggestions.length > 0 && (
                <div className="mt-3 space-y-1">
                  {suggestions.map((r) => (
                    <button
                      key={`${r.artist}-${r.title}`}
                      onClick={() =>
                        lookup(r.artist, r.title, "artwork_url" in r ? r.artwork_url : undefined)
                      }
                      className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-star-white">
                          {r.title}
                        </span>
                        <span className="block truncate text-[11px] text-star-white/50">{r.artist}</span>
                      </span>
                      {busyFor(r.artist, r.title) ? (
                        <Loader2 size={14} className="flex-shrink-0 animate-spin text-neon-violet" />
                      ) : (
                        <AudioLines size={14} className="flex-shrink-0 text-neon-violet/70" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {notFound && (
                <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-[12px] leading-relaxed text-star-white/50">
                  No documented samples for that track yet — the data is a hand-checked catalog
                  plus community-maintained MusicBrainz, so well-known records resolve and deep
                  cuts often don&rsquo;t.{" "}
                  <a
                    href={`https://www.whosampled.com/search/?q=${encodeURIComponent(query)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-neon-violet hover:underline"
                  >
                    Try WhoSampled <ExternalLink size={10} />
                  </a>
                </p>
              )}

              {/* ── browse: the records everyone keeps lifting from ── */}
              <section className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
                  <Trophy size={11} className="text-neon-violet/70" /> Most sampled sources
                </p>
                <div className="space-y-1">
                  {leaders.map((row, i) => (
                    <button
                      key={`${row.artist}-${row.title}`}
                      onClick={() => lookup(row.artist, row.title)}
                      className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-neon-violet/40 hover:bg-neon-violet/[0.08]"
                    >
                      <span className="w-5 flex-shrink-0 text-center font-mono text-[13px] font-bold text-neon-violet/80">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-star-white">
                          {row.title}
                        </span>
                        <span className="block truncate text-[11px] text-star-white/50">
                          {row.artist}
                          {row.year ? ` · ${row.year}` : ""}
                        </span>
                      </span>
                      {busyFor(row.artist, row.title) ? (
                        <Loader2 size={14} className="flex-shrink-0 animate-spin text-neon-violet" />
                      ) : (
                        <span className="flex-shrink-0 rounded-full bg-neon-violet/15 px-2 py-1 text-[10px] font-bold text-neon-violet">
                          {row.count}×
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* ── browse: songs built out of the most sources ── */}
              <section className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
                  <Sparkles size={11} className="text-neon-blue/70" /> Deep diggers
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {picks.map((p) => (
                    <button
                      key={`${p.artist}-${p.title}`}
                      onClick={() => lookup(p.artist, p.title)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-star-white/70 transition-colors hover:border-neon-blue/40 hover:text-star-white"
                    >
                      {p.artist} — {p.title}
                      <span className="ml-1.5 text-neon-blue/80">{p.sources}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* timestamps the listener has marked */}
              <section className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
                  <Clock size={11} /> Your marked timings
                </p>
                {marked.length === 0 ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-star-white/40">
                    Nothing marked yet. Open any breakdown, play a track and hit{" "}
                    <span className="text-star-white/70">Mark this moment</span> — no open
                    database publishes sample timings, so this is how they get captured.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {marked.map((m, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                      >
                        <p className="truncate text-[12px] font-bold text-star-white">{m.subject}</p>
                        <p className="truncate text-[11px] text-star-white/50">
                          samples {m.sample}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-neon-violet">{m.mark}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <a
                href="/samples"
                className="mt-6 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-3 text-[11px] font-bold uppercase tracking-widest text-star-white/50 hover:border-white/25 hover:text-star-white"
              >
                Full sample DNA page <ArrowRight size={12} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The full breakdown. Closing it returns to the browse list rather than
          dumping you back on the grid — the explorer is where you were. */}
      <AnimatePresence>
        {viewing && (
          <SamplePage
            subject={viewing.subject}
            samples={viewing.samples}
            releases={releases}
            onClose={() => {
              setViewing(null);
              setOpen(true);
            }}
          />
        )}
      </AnimatePresence>
    </Portal>
  );
}
