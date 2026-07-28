"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, AudioLines, Clock, Loader2 } from "lucide-react";
import { Portal } from "./Portal";
import { useScrollLock } from "@/lib/useScrollLock";
import { useBackClose } from "@/lib/useBackClose";
import { SamplePage, readMarks, type SampleRef, type SampleSubject } from "./SamplePage";
import type { Release } from "@/lib/types";

/**
 * Samples mode — a dedicated way into the sample graph.
 *
 * Two entry points, because sample data is sparse and browsing blindly is
 * frustrating:
 *   1. Look up any song directly and see what it samples / what sampled it.
 *   2. Jump back into connections you've already timestamped, which is the
 *      only place those marks are otherwise reachable.
 *
 * Opened globally via the `pulsar-open-samples` event (navbar button).
 */
export function SamplesExplorer({ releases }: { releases: Release[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ subject: SampleSubject; samples: SampleRef[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [marked, setMarked] = useState<{ subject: string; sample: string; mark: string }[]>([]);
  const [viewing, setViewing] = useState<{ subject: SampleSubject; samples: SampleRef[] } | null>(null);

  useScrollLock(open);
  useBackClose(open, () => setOpen(false));

  useEffect(() => {
    const activate = () => setOpen(true);
    window.addEventListener("pulsar-open-samples", activate);
    return () => window.removeEventListener("pulsar-open-samples", activate);
  }, []);

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

  async function lookup(artist: string, title: string, artwork: string) {
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
        setResult({ subject: { artist, title, artwork_url: artwork }, samples });
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setBusy(false);
    }
  }

  // Match the typed query against the loaded catalogue so we can look up a real
  // release (with its artwork) rather than guessing at free text.
  const q = query.trim().toLowerCase();
  const suggestions = q.length < 2
    ? []
    : releases
        .filter(
          (r) =>
            r.artist.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)
        )
        .slice(0, 8);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[57] flex flex-col bg-[#07070d]/98 backdrop-blur-2xl lg:inset-x-auto lg:right-0 lg:top-14 lg:w-1/2"
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
              <div className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-2.5">
                <Search size={15} className="flex-shrink-0 text-star-white/45" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a song or artist…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-star-white placeholder:text-star-white/35 focus:outline-none"
                />
                {busy && <Loader2 size={15} className="animate-spin text-neon-violet" />}
              </div>

              {/* catalogue suggestions */}
              {suggestions.length > 0 && (
                <div className="mt-3 space-y-1">
                  {suggestions.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => lookup(r.artist, r.title, r.artwork_url)}
                      className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-star-white">
                          {r.title}
                        </span>
                        <span className="block truncate text-[11px] text-star-white/50">{r.artist}</span>
                      </span>
                      <AudioLines size={14} className="flex-shrink-0 text-neon-violet/70" />
                    </button>
                  ))}
                </div>
              )}

              {notFound && (
                <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-[12px] leading-relaxed text-star-white/50">
                  No documented samples for that track yet. Sample data comes from
                  MusicBrainz, which is community-maintained — well-known records
                  resolve, deep cuts often don&rsquo;t.
                </p>
              )}

              {result && (
                <button
                  onClick={() => setViewing(result)}
                  className="mt-4 flex w-full items-center gap-3 rounded-xl border border-neon-violet/40 bg-neon-violet/10 p-4 text-left transition-colors hover:bg-neon-violet/20"
                >
                  <AudioLines size={18} className="flex-shrink-0 text-neon-violet" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-star-white">
                      {result.subject.title}
                    </span>
                    <span className="block text-[11px] text-neon-violet">
                      {result.samples.length} connection{result.samples.length > 1 ? "s" : ""} — open breakdown
                    </span>
                  </span>
                </button>
              )}

              {/* timestamps the listener has marked */}
              <div className="mt-7">
                <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
                  <Clock size={11} /> Your marked timings
                </p>
                {marked.length === 0 ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-star-white/40">
                    Nothing marked yet. Open any sample breakdown and use{" "}
                    <span className="text-star-white/70">Mark times</span> to record where the
                    sample lands in the song and where it was lifted from in the original —
                    no open database publishes those, so this is how they get captured.
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* the full breakdown, layered above */}
      <AnimatePresence>
        {viewing && (
          <SamplePage
            subject={viewing.subject}
            samples={viewing.samples}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </Portal>
  );
}
