/**
 * Pure graph engine over the curated sample catalog.
 *
 * The catalog is a flat list of (song → source) edges; this module turns it
 * into a queryable graph so the UI can do the things WhoSampled is loved for
 * without any external calls:
 *
 *   - trace a song's FULL ancestry (chains: A samples B samples C…)
 *   - find the shortest sample path between ANY two songs ("Connect")
 *   - rank the most-sampled artists and source decades
 *
 * All functions are synchronous and pure — trivially testable, instant at
 * runtime, and they work offline, which is exactly where MusicBrainz falls
 * down.
 */

import { SAMPLE_CATALOG } from "./samples-catalog";

const norm = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

export interface SongKey {
  artist: string;
  title: string;
}

export interface GraphNode extends SongKey {
  id: string;
  /** 0 = the song we started from; each sample hop up adds 1. */
  level: number;
  parentId: string | null;
  year: string | null;
  /** true when the edge into this node is an interpolation, not a lift */
  partial: boolean;
  note?: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: { from: string; to: string; partial: boolean }[];
}

/** ── adjacency ─────────────────────────────────────────────── */

interface Edge {
  from: string; // key of the sampling song
  to: string; // key of the source song
  partial: boolean;
  note?: string;
}

const songCache = new Map<string, SongKey>();
const edgesCache: Edge[] = [];
let adjacency: Map<string, { up: { key: string; partial: boolean }[]; down: { key: string; partial: boolean }[] }> | null = null;

/** Build (once) the normalized adjacency for both directions. */
function getGraph() {
  if (adjacency) return adjacency;
  const map = new Map<string, { up: { key: string; partial: boolean }[]; down: { key: string; partial: boolean }[] }>();
  const ensure = (key: string) => {
    if (!map.has(key)) map.set(key, { up: [], down: [] });
    return map.get(key)!;
  };
  edgesCache.length = 0;
  songCache.clear();
  for (const e of SAMPLE_CATALOG) {
    const fromKey = `${norm(e.artist)}::${norm(e.title)}`;
    const toKey = `${norm(e.sourceArtist)}::${norm(e.sourceTitle)}`;
    if (!fromKey || fromKey === "::" || !toKey || toKey === "::") continue;
    songCache.set(fromKey, { artist: e.artist, title: e.title });
    songCache.set(toKey, { artist: e.sourceArtist, title: e.sourceTitle });
    const edge: Edge = { from: fromKey, to: toKey, partial: Boolean(e.partial), note: e.note };
    edgesCache.push(edge);
    ensure(fromKey).up.push({ key: toKey, partial: edge.partial });
    ensure(toKey).down.push({ key: fromKey, partial: edge.partial });
  }
  adjacency = map;
  return map;
}

function songYear(key: string): string | null {
  const e = SAMPLE_CATALOG.find(
    (c) => `${norm(c.sourceArtist)}::${norm(c.sourceTitle)}` === key && c.sourceYear
  );
  return e?.sourceYear ?? null;
}

/** Resolve a user query to the best-matching catalog song key, or null. */
function resolveKey(artist: string, title: string): string | null {
  const g = getGraph();
  const wantArtist = norm(artist);
  const wantTitle = norm(title);
  const exact = `${wantArtist}::${wantTitle}`;
  if (g.has(exact)) return exact;
  // loose: same title, artist contains or vice-versa
  for (const key of g.keys()) {
    const [a, t] = key.split("::");
    if (!a || !t) continue;
    if (t === wantTitle && (a.includes(wantArtist) || wantArtist.includes(a))) return key;
    if (a === wantArtist && (t.includes(wantTitle) || wantTitle.includes(t))) return key;
  }
  return null;
}

/** ── 1. chains — full sample ancestry of a song ────────────── */

/**
 * Walk everything the song samples, transitively, breadth-first, up to
 * `maxDepth` hops. The result is a tree the SampleGraph can render directly.
 */
export function traceChains(artist: string, title: string, maxDepth = 4): GraphResult {
  const g = getGraph();
  const rootKey = resolveKey(artist, title);
  const nodes: GraphNode[] = [];
  const edges: GraphResult["edges"] = [];
  if (!rootKey) return { nodes, edges };

  const idOf = new Map<string, string>();
  const visited = new Set<string>([rootKey]);

  const push = (key: string, level: number, parentId: string | null, partial: boolean, note?: string) => {
    const song = songCache.get(key)!;
    const id = `n${nodes.length}`;
    idOf.set(key, id);
    nodes.push({ ...song, id, level, parentId, year: level === 0 ? null : songYear(key), partial, note });
    if (parentId !== null) edges.push({ from: parentId, to: id, partial });
    return id;
  };

  push(rootKey, 0, null, false);
  let frontier = [rootKey];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = [];
    for (const key of frontier) {
      const ups = g.get(key)?.up ?? [];
      for (const { key: upKey, partial } of ups) {
        if (visited.has(upKey)) {
          const existingId = idOf.get(upKey);
          const parentId = idOf.get(key);
          if (existingId && parentId && !edges.some((e) => e.from === parentId && e.to === existingId)) {
            edges.push({ from: parentId, to: existingId, partial });
          }
          continue;
        }
        visited.add(upKey);
        const note = edgesCache.find((e) => e.from === key && e.to === upKey)?.note;
        push(upKey, depth, idOf.get(key) ?? null, partial, note);
        next.push(upKey);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { nodes, edges };
}

/** ── 2. connect — shortest sample path between two songs ───── */

export interface ConnectResult {
  found: boolean;
  /** The path as songs, in order: [songA, ..., songB]. Empty when not found. */
  path: GraphNode[];
  /** Direct sources both songs sample (they share DNA even without a chain). */
  commonSources: SongKey[];
}

/** Records both songs sample directly. */
export function commonSources(
  aArtist: string, aTitle: string,
  bArtist: string, bTitle: string
): SongKey[] {
  const g = getGraph();
  const aKey = resolveKey(aArtist, aTitle);
  const bKey = resolveKey(bArtist, bTitle);
  if (!aKey || !bKey) return [];
  const aUps = new Set((g.get(aKey)?.up ?? []).map((u) => u.key));
  const out: SongKey[] = [];
  for (const { key } of g.get(bKey)?.up ?? []) {
    if (aUps.has(key)) out.push(songCache.get(key)!);
  }
  return out;
}

/**
 * Bidirectional question WhoSampled can't answer in one search: how are these
 * two songs related through sampling? Either a chain (A samples X samples …
 * and B samples that same record), or at minimum the records they both lift.
 */
export function connectSongs(
  aArtist: string, aTitle: string,
  bArtist: string, bTitle: string
): ConnectResult {
  const g = getGraph();
  const aKey = resolveKey(aArtist, aTitle);
  const bKey = resolveKey(bArtist, bTitle);
  if (!aKey || !bKey) return { found: false, path: [], commonSources: [] };
  const common = commonSources(aArtist, aTitle, bArtist, bTitle);
  if (aKey === bKey) return { found: false, path: [], commonSources: common };

  // BFS from A over BOTH directions (samples + sampled-in), tracking parents.
  const parent = new Map<string, { key: string; partial: boolean }>();
  const queue = [aKey];
  const seen = new Set([aKey]);
  while (queue.length) {
    const key = queue.shift()!;
    if (key === bKey) break;
    const node = g.get(key);
    if (!node) continue;
    for (const dir of [node.up, node.down]) {
      for (const { key: nKey, partial } of dir) {
        if (seen.has(nKey)) continue;
        seen.add(nKey);
        parent.set(nKey, { key, partial });
        queue.push(nKey);
      }
    }
  }

  if (!parent.has(bKey)) {
    return { found: false, path: [], commonSources: common };
  }

  const keys: string[] = [];
  for (let k: string | undefined = bKey; k; k = parent.get(k)?.key) {

    keys.unshift(k);
  }
  const path: GraphNode[] = keys.map((key, i) => {
    const song = songCache.get(key)!;
    const intoPartial = i > 0 ? parent.get(key)?.partial ?? false : false;
    return {
      ...song,
      id: `p${i}`,
      level: i,
      parentId: i > 0 ? `p${i - 1}` : null,
      year: songYear(key),
      partial: intoPartial,
    };
  });
  return { found: true, path, commonSources: common };
}
/** ── 3. leaderboards ───────────────────────────────────────── */

export interface ArtistRow {
  artist: string;
  /** times this artist's records were sampled (as source) */
  sampledCount: number;
  /** times this artist sampled others */
  samplingCount: number;
}

/** Most-sampled source artists — the crate-digger canon. */
export function mostSampledArtists(limit = 10): ArtistRow[] {
  getGraph();
  const rows = new Map<string, ArtistRow>();
  for (const c of SAMPLE_CATALOG) {
    const r = rows.get(c.sourceArtist) ?? { artist: c.sourceArtist, sampledCount: 0, samplingCount: 0 };
    r.sampledCount += 1;
    rows.set(c.sourceArtist, r);
    const s = rows.get(c.artist) ?? { artist: c.artist, sampledCount: 0, samplingCount: 0 };
    s.samplingCount += 1;
    rows.set(c.artist, s);
  }
  return Array.from(rows.values())
    .filter((r) => r.sampledCount > 0)
    .sort((a, b) => b.sampledCount - a.sampledCount || b.samplingCount - a.samplingCount)
    .slice(0, limit);
}

export interface DecadeRow {
  decade: string; // "1970s"
  count: number;
}

/** Which decades the sampled sources come from — how far back the DNA goes. */
export function sourceDecades(): DecadeRow[] {
  const counts = new Map<string, number>();
  for (const c of SAMPLE_CATALOG) {
    const y = c.sourceYear;
    if (!y || !/^\d{4}$/.test(y)) continue;
    const decade = `${y.slice(0, 3)}0s`;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => a.decade.localeCompare(b.decade));
}

/** Every distinct song in the catalog, for search suggestions. */
export function catalogSongs(): SongKey[] {
  getGraph();
  const out: SongKey[] = [];
  const seen = new Set<string>();
  for (const s of songCache.values()) {
    const k = `${norm(s.artist)}::${norm(s.title)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
