"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Search, Loader2, AudioLines, Trophy, Sparkles, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { SamplePage, type SampleRef, type SampleSubject } from "./SamplePage";
import { mostSampledSources, catalogSamplers } from "@/lib/samples-catalog";
import type { Release } from "@/lib/types";

/**
 * The /samples experience — deep-linkable home of the sample graph.
 *
 * Beyond the explorer (an overlay on the main page), this page:
 *   - accepts ?artist=&title= and opens the breakdown immediately
 *   - shows the "most sampled" leaderboard from the curated catalog
 *   - cross-links sampled records back into Pulsar releases
 */
export function SamplesClient({
  releases,
  initial,
}: {
  releases: Release[];
  initial: { artist: string; title: string } | null;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ subject: SampleSubject; samples: SampleRef[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [viewing, setViewing] = useState<{ subject: SampleSubject; samples: SampleRef[] } | null>(null);

  const leaders = useMemo(() => mostSampledSources(10), []);
  const picks = useMemo(() => catalogSamplers(10), []);

  async function lookup(artist: string, title: string, artwork?: string) {
    setBusy(true);
    setNotFound(false);
    setResult(null);
    try {
      const res = await fetch(
        `/api/samples?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`
      );
      const data = await res.json();
      const samples: SampleRef[] = Array.isArray(data.samples) ? data.samples : [];
      if (samples.length) {
        const subject: SampleSubject = {
          artist,
          title,
          artwork_url:
            artwork ?? `/api/artwork?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
        };
        setResult({ subject, samples });
        setViewing({ subject, samples });
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setBusy(false);
    }
  }

  // Deep link: ?artist=&title= opens the breakdown straight away.
  useEffect(() => {
    if (initial) lookup(initial.artist, initial.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const suggestions =
    q.length < 2
      ? []
      : releases
          .filter((r) => r.artist.toLowerCase().includes(q) || r.title.toLowerCase().includes(q))
          .slice(0, 8);

  return (
    <div className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-28 md:px-6">
      {/* header */}
      <header className="mb-8">
        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.3em] text-neon-violet/80">
          <AudioLines size={12} /> Sample DNA
        </p>
        <h1 className="text-2xl font-bold uppercase tracking-tight text-star-white md:text-3xl">
          What&rsquo;s the sample?
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-star-white/50">
          Trace any song&rsquo;s lineage — what it samples, what sampled it, covers and remixes —
          through MusicBrainz and the Cover Art Archive.
        </p>
      </header>

      {/* search */}
      <div className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-3">
        <Search size={16} className="flex-shrink-0 text-star-white/45" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a song or artist…"
          className="min-w-0 flex-1 bg-transparent text-sm text-star-white placeholder:text-star-white/35 focus:outline-none"
        />
        {busy && <Loader2 size={15} className="animate-spin text-neon-violet" />}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 space-y-1">
          {suggestions.map((r) => (
            <button
              key={r.id}
              onClick={() => lookup(r.artist, r.title, r.artwork_url)}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-star-white">{r.title}</span>
                <span className="block truncate text-[11px] text-star-white/50">{r.artist}</span>
              </span>
              <AudioLines size={14} className="flex-shrink-0 text-neon-violet/70" />
            </button>
          ))}
        </div>
      )}

      {notFound && (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-[12px] leading-relaxed text-star-white/50">
          No documented samples for that track yet. Sample data comes from MusicBrainz, which is
          community-maintained — well-known records resolve, deep cuts often don&rsquo;t.
        </p>
      )}
      {/* most sampled leaderboard */}
      <section className="mt-12">
        <h2 className="mb-3 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
          <Trophy size={11} className="text-neon-violet/70" /> Most sampled sources
        </h2>
        <div className="space-y-1">
          {leaders.map((row, i) => (
            <button
              key={`${row.artist}-${row.title}`}
              onClick={() => lookup(row.artist, row.title)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-neon-violet/40 hover:bg-neon-violet/[0.08]"
            >
              <span className="w-6 flex-shrink-0 text-center font-mono text-[13px] font-bold text-neon-violet/80">
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
              <span className="flex-shrink-0 rounded-full bg-neon-violet/15 px-2 py-1 text-[10px] font-bold text-neon-violet">
                {row.count}×
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* curated picks — songs that flip the most sources */}
      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
          <Sparkles size={11} className="text-neon-blue/70" /> Deep diggers — most sources flipped
        </h2>
        <div className="flex flex-wrap gap-2">
          {picks.map((p) => (
            <button
              key={`${p.artist}-${p.title}`}
              onClick={() => lookup(p.artist, p.title)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-star-white/70 transition-colors hover:border-neon-blue/40 hover:text-star-white"
            >
              {p.artist} — {p.title}
              <span className="ml-1.5 text-neon-blue/80">{p.sources} src</span>
            </button>
          ))}
        </div>
      </section>

      <p className="mt-12 flex flex-wrap items-center justify-center gap-1.5 text-center text-[11px] text-star-white/30">
        <ArrowDownRight size={11} /> Sample chain data from MusicBrainz · Artwork from the Cover Art
        Archive · <Link href="/" className="underline hover:text-star-white/60">back to the grid</Link>
      </p>

      {/* full breakdown overlay */}
      <AnimatePresence>
        {viewing && (
          <SamplePage
            subject={viewing.subject}
            samples={viewing.samples}
            releases={releases}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
