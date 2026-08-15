import { NextRequest, NextResponse } from "next/server";
import type { SampleRef, RelationRole } from "../route";

export const runtime = "nodejs";

/**
 * GET /api/samples/chain?artist=...&title=...
 *
 * Trace a song's sample DNA backwards through time: "this samples X, which
 * samples Y, which samples Z…" — the deep ancestry WhoSampled shows as a
 * flat list, but is really a tree. We walk up to 4 levels deep, breadth-first,
 * so a user can see the FULL lineage of a track in one call.
 *
 * Each node carries its level (0 = the song itself, 1 = direct sample, …) and
 * the parent it was reached from, so the UI can render it as a graph.
 */

const UA = "Pulsar/1.0 ( https://pulsar-ten-sigma.vercel.app )";

interface ChainNode {
  id: string;          // stable graph id
  artist: string;
  title: string;
  year: string | null;
  level: number;       // 0 = root, 1 = direct ancestor, ...
  parentId: string | null;
  role: RelationRole;  // how the parent relates to this node
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function creditToName(credit: any[]): string | null {
  if (!Array.isArray(credit)) return null;
  const name = credit.map((c) => `${c.name ?? c.artist?.name ?? ""}${c.joinphrase ?? ""}`).join("");
  return name.trim() || null;
}

/** Fetch the "samples" relationships for one recording (one hop up the tree). */
async function samplesOf(artist: string, title: string): Promise<SampleRef[]> {
  const headers = { "User-Agent": UA, Accept: "application/json" };
  try {
    const query = encodeURIComponent(`artist:"${artist}" AND recording:"${title}"`);
    const searchRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=5`,
      { headers, signal: AbortSignal.timeout(7000), next: { revalidate: 604800 } }
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const recs: any[] = (searchData.recordings ?? []).filter((r: any) => (r.score ?? 0) >= 80);
    const targets = (recs.length ? recs : (searchData.recordings ?? []).slice(0, 1)).slice(0, 3);
    const out: SampleRef[] = [];
    for (const rec of targets) {
      try {
        const relRes = await fetch(
          `https://musicbrainz.org/ws/2/recording/${rec.id}?inc=recording-rels&fmt=json`,
          { headers, signal: AbortSignal.timeout(7000), next: { revalidate: 604800 } }
        );
        if (!relRes.ok) continue;
        const d = await relRes.json();
        for (const rel of d.relations ?? []) {
          if (!rel.type || !/sampl/i.test(rel.type)) continue;
          if (rel.direction === "backward") continue; // "sampled by" — wrong direction
          const target = rel.recording ?? rel.work;
          if (!target?.title) continue;
          const tArtist = creditToName(rel.recording?.["artist-credit"]);
          const year = (rel.recording?.["first-release-date"] || "")?.slice(0, 4) || null;
          out.push({
            role: "samples",
            title: target.title,
            artist: tArtist,
            year,
            partial: false,
            timestamp: null,
            description: "",
            mbid: target.id ?? null,
          });
        }
      } catch {
        /* skip this recording */
      }
    }
    return out;
  } catch {
    return [];
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200) ?? "";
  const title = searchParams.get("title")?.slice(0, 200) ?? "";
  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required" }, { status: 400 });
  }

  const MAX_DEPTH = 4;
  const nodes: ChainNode[] = [];
  const edges: { from: string; to: string; role: RelationRole }[] = [];
  const visited = new Set<string>(); // dedupe by normalised artist::title

  const rootId = "n0";
  nodes.push({ id: rootId, artist, title, year: null, level: 0, parentId: null, role: "samples" });
  visited.add(`${norm(artist)}::${norm(title)}`);

  // Breadth-first traversal up the sample tree.
  let frontier: ChainNode[] = [nodes[0]];
  let counter = 1;
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    if (frontier.length === 0) break;
    const next: ChainNode[] = [];
    // Bound the fan-out so a prolific track doesn't explode the graph.
    const CONC = 6;
    let idx = 0;
    const worker = async () => {
      while (idx < frontier.length) {
        const node = frontier[idx++];
        const parents = await samplesOf(node.artist, node.title);
        for (const p of parents.slice(0, 5)) {
          const key = `${norm(p.artist ?? "")}::${norm(p.title)}`;
          if (visited.has(key)) {
            // Already seen — still record the edge so the graph is connected.
            const existing = nodes.find(
 (n) => `${norm(n.artist)}::${norm(n.title)}` === key
            );
            if (existing) edges.push({ from: node.id, to: existing.id, role: "samples" });
            continue;
          }
          visited.add(key);
          const id = `n${counter++}`;
          const child: ChainNode = {
            id,
            artist: p.artist ?? node.artist,
            title: p.title,
            year: p.year,
            level: depth,
            parentId: node.id,
            role: "samples",
          };
          nodes.push(child);
          edges.push({ from: node.id, to: id, role: "samples" });
          next.push(child);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, frontier.length) }, worker));
    frontier = next;
  }

  return NextResponse.json(
    { nodes, edges, depth: Math.max(...nodes.map((n) => n.level)) },
    { headers: { "Cache-Control": "public, max-age=604800", "Netlify-Vary": "query" } }
  );
}