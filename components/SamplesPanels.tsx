"use client";

import { useMemo, useState } from "react";
import { Link2, ArrowDown, Music2, Users, Mic2, ArrowDownRight, ArrowUpRight, Disc3, Sparkles, Repeat2 } from "lucide-react";
import { connectSongs, artistProfile, type ArtistRow, type DecadeRow, type SongKey } from "@/lib/samples-graph";
import { buildCreditGraph, topPeople, type CreditRole, type Person } from "@/lib/credits";
import type { Release } from "@/lib/types";

/**
 * The Connect tab — the question WhoSampled can't answer in one search:
 * "how are THESE two songs related?" Finds the shortest sample path between
 * any two songs in the graph, or falls back to the records they both sample.
 */

interface Suggest {
  (q: string): { artist: string; title: string; artwork_url?: string }[];
}

function SongPicker({
  label,
  value,
  onSelect,
  suggest,
}: {
  label: string;
  value: SongKey | null;
  onSelect: (s: SongKey) => void;
  suggest: Suggest;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => (q.length >= 2 ? suggest(q) : []), [q, suggest]);

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.24em] text-star-white/40">
        {label}
      </p>
      {value ? (
        <button
          onClick={() => onSelect(value as SongKey)}
          className="flex min-h-[52px] w-full items-center rounded-xl border border-neon-violet/40 bg-neon-violet/10 px-3 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-star-white">{value.title}</span>
            <span className="block truncate text-[11px] text-star-white/50">{value.artist}</span>
          </span>
          <span className="ml-2 flex-shrink-0 text-[9px] font-bold uppercase tracking-wide text-neon-violet/80">
            change
          </span>
        </button>
      ) : (
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pick a song…"
            aria-label={label}
            className="min-h-[52px] w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-sm text-star-white placeholder:text-star-white/35 focus:border-neon-violet/40 focus:outline-none"
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/[0.12] bg-[#0a0a14]/95 p-1 backdrop-blur-xl">
              {results.map((r) => (
                <button
                  key={`${r.artist}-${r.title}`}
                  onClick={() => {
                    onSelect({ artist: r.artist, title: r.title });
                    setQ("");
                  }}
                  className="flex min-h-[44px] w-full items-center rounded-lg px-2.5 py-1.5 text-left hover:bg-white/[0.06]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold text-star-white">{r.title}</span>
                    <span className="block truncate text-[10px] text-star-white/50">{r.artist}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export function ConnectPanel({
  suggest,
  lookup,
}: {
  suggest: Suggest;
  lookup: (artist: string, title: string) => void;
}) {
  const [a, setA] = useState<SongKey | null>(null);
  const [b, setB] = useState<SongKey | null>(null);
  // Computed locally — connectSongs is pure/instant, no fetch round-trip.
  const result = useMemo(
    () => (a && b ? connectSongs(a.artist, a.title, b.artist, b.title) : null),
    [a, b]
  );

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <SongPicker label="Song A" value={a} onSelect={setA} suggest={suggest} />
        <div className="flex items-center justify-center pt-5 md:pt-7">
          <Link2 size={16} className="text-neon-violet/70" />
        </div>
        <SongPicker label="Song B" value={b} onSelect={setB} suggest={suggest} />
      </div>

      {result && (
        <div className="mt-5">
          {result.found ? (
            <div className="rounded-xl border border-neon-violet/25 bg-neon-violet/[0.06] p-4">
              <p className="mb-3 px-1 text-[9px] font-bold uppercase tracking-[0.24em] text-neon-violet/80">
                Connected in {result.path.length - 1} sample {result.path.length - 1 === 1 ? "hop" : "hops"}
              </p>
              <ol className="space-y-1.5">
                {result.path.map((n, i) => (
                  <li key={n.id} className="flex items-start gap-2">
                    {i > 0 && <ArrowDown size={11} className="mt-1 flex-shrink-0 text-star-white/30" />}
                    <button
                      onClick={() => lookup(n.artist, n.title)}
                      className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left hover:bg-white/[0.06]"
                    >
                      <span className="block truncate text-[13px] font-bold text-star-white">{n.title}</span>
                      <span className="block truncate text-[11px] text-star-white/50">
                        {n.artist}
                        {n.year ? ` · ${n.year}` : ""}
                        {i > 0 && n.partial ? " · interpolation" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : result.commonSources.length > 0 ? (
            <div className="rounded-xl border border-neon-blue/25 bg-neon-blue/[0.06] p-4">
              <p className="mb-3 px-1 text-[9px] font-bold uppercase tracking-[0.24em] text-neon-blue/80">
                No chain — but they share DNA
              </p>
              <p className="mb-2 px-1 text-[11px] text-star-white/50">
                Both songs sample {result.commonSources.length === 1 ? "this record" : "these records"}:
              </p>
              <div className="flex flex-wrap gap-2">
                {result.commonSources.map((s) => (
                  <button
                    key={`${s.artist}-${s.title}`}
                    onClick={() => lookup(s.artist, s.title)}
                    className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-[11px] text-star-white/80 hover:border-neon-blue/40 hover:text-star-white"
                  >
                    {s.artist} — {s.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-[12px] leading-relaxed text-star-white/50">
              No documented connection between these two in the graph yet — try songs from the curated
              canon below, or search each one in Lookup.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


/**
 * The Canon tab — crate-digger statistics from the graph: which artists get
 * sampled the most, and which decades the DNA keeps getting pulled from.
 */
export function CanonPanel({ artists, decades }: { artists: ArtistRow[]; decades: DecadeRow[] }) {
  const maxDecade = Math.max(1, ...decades.map((d) => d.count));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
          <Users size={11} className="text-neon-violet/70" /> Most sampled artists
        </h2>
        <div className="space-y-1">
          {artists.map((row, i) => (
            <div
              key={row.artist}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              <span className="w-6 flex-shrink-0 text-center font-mono text-[13px] font-bold text-neon-violet/80">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-star-white">
                {row.artist}
              </span>
              <span className="flex-shrink-0 rounded-full bg-neon-violet/15 px-2 py-1 text-[10px] font-bold text-neon-violet">
                sampled {row.sampledCount}×
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
          <Music2 size={11} className="text-neon-blue/70" /> Where the DNA comes from
        </h2>
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {decades.map((d) => (
            <div key={d.decade} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] font-bold text-star-white/60">{d.count}</span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-neon-blue/30 to-neon-violet/70"
                style={{ height: `${Math.max(6, Math.round((d.count / maxDecade) * 96))}px` }}
                role="img"
                aria-label={`${d.decade}: ${d.count} sources`}
              />
              <span className="truncate text-[9px] font-bold uppercase tracking-wide text-star-white/40">
                {d.decade}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-[10px] leading-relaxed text-star-white/30">
          Decades of the records that keep getting flipped — the taller the bar, the more of the graph
          runs through that era.
        </p>
      </section>
    </div>
  );
}


/**
 * The Artist tab — WhoSampled's artist page, distilled. One artist, both
 * directions: every record their songs lift from, and every song that lifts
 * from them. Pure/instant (artistProfile is a synchronous graph walk), so the
 * whole page is offline and there's no fetch round-trip.
 */
export function ArtistPanel({
  suggest,
  lookup,
}: {
  suggest: Suggest;
  lookup: (artist: string, title: string) => void;
}) {
  const [q, setQ] = useState("");
  const [artist, setArtist] = useState<string | null>(null);
  const results = useMemo(() => (q.length >= 2 ? suggest(q) : []), [q, suggest]);
  const profile = useMemo(() => (artist ? artistProfile(artist) : null), [artist]);

  // Suggest artists (not songs) — dedupe the artist field from suggestions.
  const artistSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of results) {
      const a = r.artist.trim();
      if (a && !seen.has(a.toLowerCase())) {
        seen.add(a.toLowerCase());
        out.push(a);
      }
    }
    return out.slice(0, 6);
  }, [results]);

  return (
    <div>
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search an artist…"
          aria-label="Search an artist"
          className="min-h-[52px] w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-sm text-star-white placeholder:text-star-white/35 focus:border-neon-violet/40 focus:outline-none"
        />
        {artistSuggestions.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/[0.12] bg-[#0a0a14]/95 p-1 backdrop-blur-xl">
            {artistSuggestions.map((a) => (
              <button
                key={a}
                onClick={() => {
                  setArtist(a);
                  setQ("");
                }}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-white/[0.06]"
              >
                <Mic2 size={13} className="flex-shrink-0 text-neon-violet/70" />
                <span className="truncate text-[12px] font-bold text-star-white">{a}</span>
              </button>
            ))}
          </div>
        )}
      </div>


      {profile && (
        <div className="mt-5 space-y-6">
          {/* header */}
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-neon-violet/15">
              <Mic2 size={18} className="text-neon-violet" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-star-white">{profile.artist}</p>
              <p className="text-[11px] text-star-white/50">
                {profile.songs.length} song{profile.songs.length === 1 ? "" : "s"} in the graph
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-2 text-center">
              <div className="rounded-lg bg-neon-violet/10 px-3 py-1.5">
                <p className="text-[15px] font-bold leading-none text-neon-violet">{profile.samplingCount}</p>
                <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-star-white/40">samples</p>
              </div>
              <div className="rounded-lg bg-neon-blue/10 px-3 py-1.5">
                <p className="text-[15px] font-bold leading-none text-neon-blue">{profile.sampledCount}</p>
                <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-star-white/40">sampled</p>
              </div>
            </div>
          </div>

          {profile.samples.length === 0 && profile.sampledBy.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-[12px] leading-relaxed text-star-white/50">
              This artist isn&rsquo;t in the curated sample graph yet. Try a crate-digger canon name —
              James Brown, Kanye West, Daft Punk, The Winstons…
            </p>
          ) : (
            <>
              {profile.samples.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
                    <ArrowDownRight size={11} className="text-neon-violet/70" /> What they sample
                  </h2>
                  <div className="space-y-1">
                    {profile.samples.map((e, i) => (
                      <button
                        key={`s-${i}`}
                        onClick={() => lookup(e.artist, e.title)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-neon-violet/40 hover:bg-neon-violet/[0.08]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-star-white">{e.title}</span>
                          <span className="block truncate text-[11px] text-star-white/50">
                            {e.artist}
                            {e.year ? ` · ${e.year}` : ""}
                            {e.partial ? " · interpolation" : ""}
                          </span>
                        </span>
                        {e.note && (
                          <span className="hidden max-w-[40%] flex-shrink-0 truncate text-[10px] italic text-star-white/35 md:block">
                            {e.note}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}



              {profile.sampledBy.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.24em] text-star-white/40">
                    <ArrowUpRight size={11} className="text-neon-blue/70" /> Who sampled them
                  </h2>
                  <div className="space-y-1">
                    {profile.sampledBy.map((e, i) => (
                      <button
                        key={`b-${i}`}
                        onClick={() => lookup(e.artist, e.title)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-neon-blue/40 hover:bg-neon-blue/[0.08]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-star-white">{e.title}</span>
                          <span className="block truncate text-[11px] text-star-white/50">
                            {e.artist}
                            {e.partial ? " · interpolation" : ""}
                          </span>
                        </span>
                        {e.note && (
                          <span className="hidden max-w-[40%] flex-shrink-0 truncate text-[10px] italic text-star-white/35 md:block">
                            {e.note}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── People tab — the credit graph, surfaced ──────────────────────

const ROLE_META: Record<CreditRole, { label: string; icon: typeof Disc3; color: string }> = {
  main: { label: "Artist", icon: Mic2, color: "text-star-white/70" },
  featured: { label: "Featured", icon: Sparkles, color: "text-neon-green" },
  producer: { label: "Producer", icon: Disc3, color: "text-neon-violet" },
  remixer: { label: "Remixer", icon: Repeat2, color: "text-neon-blue" },
};

/**
 * The People tab — "who is running the scene right now". Built from the credit
 * graph over the catalogue: producers weigh heaviest, then remixers, featured
 * artists, and main credits. Every name is recovered deterministically from the
 * artist + title strings (no API, no model), so the whole list is offline.
 */
export function PeoplePanel({ releases }: { releases: Release[] }) {
  const [role, setRole] = useState<CreditRole | "all">("all");

  const graph = useMemo(() => buildCreditGraph(releases), [releases]);
  const people = useMemo(
    () => topPeople(graph, { role: role === "all" ? undefined : role, limit: 50 }),
    [graph, role]
  );

  const roleCount = (p: Person, r: CreditRole) => p.roles[r]?.length ?? 0;

  return (
    <div>
      {/* role filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "producer", "remixer", "featured", "main"] as const).map((r) => {
          const Icon = r === "all" ? Users : ROLE_META[r].icon;
          return (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                role === r
                  ? "border-neon-violet/60 bg-neon-violet/15 text-neon-violet"
                  : "border-white/10 bg-white/[0.03] text-star-white/55 hover:border-white/25 hover:text-star-white"
              }`}
            >
              <Icon size={12} />
              {r === "all" ? "All roles" : ROLE_META[r].label}
            </button>
          );
        })}
      </div>

      {people.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-[12px] leading-relaxed text-star-white/50">
          No credits extracted yet. The credit graph is built from the live catalogue —
          once releases flow through the feed, producers, remixers and featured artists
          appear here.
        </p>
      ) : (
        <div className="space-y-1">
          {people.map((p, i) => (
            <div
              key={p.slug}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              <span className="w-6 flex-shrink-0 text-center font-mono text-[13px] font-bold text-neon-violet/80">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-star-white">
                  {p.name}
                </span>
                <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-star-white/45">
                  {(Object.keys(p.roles) as CreditRole[]).map((r) => (
                    <span key={r} className={`inline-flex items-center gap-1 ${ROLE_META[r].color}`}>
                      {roleCount(p, r)} {ROLE_META[r].label.toLowerCase()}
                    </span>
                  ))}
                </span>
              </span>
              <span className="flex-shrink-0 rounded-full bg-neon-violet/15 px-2 py-1 text-[10px] font-bold text-neon-violet">
                {p.count} credit{p.count === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 px-1 text-[10px] leading-relaxed text-star-white/30">
        Credits are recovered from the artist + title strings themselves — no API, no
        model, nothing invented. Producers weigh heaviest because that is the signal
        nobody else surfaces.
      </p>
    </div>
  );
}

