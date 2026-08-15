import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/samples?artist=...&title=...
 *
 * WhoSampled-style sample data, keyless, via MusicBrainz relationships (the
 * only openly-licensed source — WhoSampled has no free API). Returns a rich
 * connection graph: what this recording SAMPLES, what SAMPLED it, what it
 * COVERS, what COVERED it, and any REMIX relationships. Empty arrays when
 * nothing is documented.
 *
 * MusicBrainz does not carry in-song timecodes, so `timestamp` is only
 * populated when the relationship itself provides one (rare). We never invent
 * timestamps — the linked original lets the listener hear where it lands.
 */

import { lookupCatalog } from "@/lib/samples-catalog";

const UA = "Pulsar/1.0 ( https://pulsar-ten-sigma.vercel.app )";

export type RelationRole = "samples" | "sampledBy" | "covers" | "coveredBy" | "remixOf" | "remixedBy";

export interface SampleRef {
  role: RelationRole;
  title: string;
  artist: string | null;
  year: string | null;
  partial: boolean;
  timestamp: string | null;
  description: string;
  /** MusicBrainz recording id — used by /api/samples/chain to traverse DNA. */
  mbid?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function creditToName(credit: any[]): string | null {
  if (!Array.isArray(credit)) return null;
  const name = credit.map((c) => `${c.name ?? c.artist?.name ?? ""}${c.joinphrase ?? ""}`).join("");
  return name.trim() || null;
}

/** Map a MusicBrainz relation type + direction to one of our graph roles. */
function classifyRel(type: string, direction: string): RelationRole | null {
  const t = type.toLowerCase();
  if (/sampl/.test(t)) return direction === "backward" ? "sampledBy" : "samples";
  if (/cover/.test(t)) return direction === "backward" ? "coveredBy" : "covers";
  if (/remix/.test(t)) return direction === "backward" ? "remixedBy" : "remixOf";
  // Some MB entries use "compilation" or "other version" loosely — skip those.
  return null;
}

function describe(role: RelationRole, title: string, artist: string | null): string {
  const by = artist ? ` by ${artist}` : "";
  switch (role) {
    case "samples":    return `Samples \u201C${title}\u201D${by}`;
    case "sampledBy":  return `Sampled in \u201C${title}\u201D${by}`;
    case "covers":     return `Covers \u201C${title}\u201D${by}`;
    case "coveredBy":  return `Covered by \u201C${title}\u201D${by}`;
    case "remixOf":    return `Remix of \u201C${title}\u201D${by}`;
    case "remixedBy":  return `Remixed in \u201C${title}\u201D${by}`;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);
  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required" }, { status: 400 });
  }

  const headers = { "User-Agent": UA, Accept: "application/json" };

  const samples: SampleRef[] = [];
  const seen = new Set<string>();

  // Seed with hand-checked connections first: MusicBrainz's sample graph misses
  // a great many famous, exhaustively-documented samples, and these entries are
  // richer (they say what was actually taken).
  for (const hit of lookupCatalog(artist, title)) {
    const key = `${hit.role}|${hit.title}|${hit.artist}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const byline = hit.artist ? ` by ${hit.artist}` : "";
    samples.push({
      role: hit.role,
      title: hit.title,
      artist: hit.artist,
      year: hit.year,
      partial: hit.partial,
      timestamp: null,
      description:
        hit.note ??
        (hit.role === "samples"
          ? `Samples \u201C${hit.title}\u201D${byline}`
          : `Sampled in \u201C${hit.title}\u201D${byline}`),
    });
  }

  try {
    // 1) Find matching recordings. A song exists in MusicBrainz as MANY
    //    recordings (album cut, single edit, remaster, compilation appearance),
    //    and relationships are attached per-recording — often to only one.
    //    Checking just the top hit was the main reason coverage looked thin;
    //    we now merge relationships across several.
    const query = encodeURIComponent(`artist:"${artist}" AND recording:"${title}"`);
    const searchRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=12`,
      { headers, signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } }
    );
    if (!searchRes.ok) throw new Error("mb search failed");
    const searchData = await searchRes.json();
    const recs: any[] = (searchData.recordings ?? []).filter((r: any) => (r.score ?? 0) >= 80);
    const targets = (recs.length ? recs : (searchData.recordings ?? []).slice(0, 1)).slice(0, 5);
    if (!targets.length) return NextResponse.json({ samples }); // curated hits still stand

    // 2) Pull sample/cover/remix relationships from each, in parallel.
    const relLists = await Promise.all(
      targets.map(async (rec: any) => {
        try {
          const relRes = await fetch(
            `https://musicbrainz.org/ws/2/recording/${rec.id}?inc=recording-rels+work-rels+artist-credits&fmt=json`,
            { headers, signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } }
          );
          if (!relRes.ok) return [];
          const d = await relRes.json();
          return d.relations ?? [];
        } catch {
          return [];
        }
      })
    );

    for (const rel of relLists.flat()) {
      if (!rel.type) continue;
      const role = classifyRel(rel.type, rel.direction ?? "forward");
      if (!role) continue;
      const target = rel.recording ?? rel.work;
      if (!target?.title) continue;
      const tArtist = creditToName(rel.recording?.["artist-credit"] ?? rel.work?.["artist-credit"]);
      const year =
        (rel.recording?.["first-release-date"] || rel.begin || "")?.slice(0, 4) || null;
      const attrs: string[] = Array.isArray(rel.attributes) ? rel.attributes : [];
      const partial = attrs.some((a) => /partial/i.test(a));
      // Merging across several recordings means the same connection can appear
      // more than once — keep one entry per (role, title, artist).
      const dedupeKey = `${role}|${target.title}|${tArtist ?? ""}`.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      samples.push({
        role,
        title: target.title,
        artist: tArtist,
        year,
        partial,
        timestamp: null,
        description: describe(role, target.title, tArtist),
        mbid: target.id ?? null,
      });
    }

    // "What it samples" first (the classic question), then sampled-in, then the
    // cover/remix families grouped after.
    const order: Record<RelationRole, number> = {
      samples: 0, sampledBy: 1, covers: 2, coveredBy: 3, remixOf: 4, remixedBy: 5,
    };
    samples.sort((a, b) => order[a.role] - order[b.role]);

    return NextResponse.json(
      { samples },
      { headers: { "Netlify-Vary": "query", "Cache-Control": "public, max-age=604800" } }
    );
  } catch {
    // MusicBrainz unreachable — still return the curated hits.
    return NextResponse.json({ samples }, { status: 200 });
  }
}
