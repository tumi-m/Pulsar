import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/samples?artist=...&title=...
 *
 * WhoSampled-style sample data, keyless, via MusicBrainz "samples material"
 * relationships (the only openly-licensed source — WhoSampled has no free API).
 * Returns { samples: SampleRef[] } describing what this recording samples and
 * what samples it. Empty array when nothing is documented.
 *
 * Note: MusicBrainz does not carry in-song timecodes, so `timestamp` is only
 * populated when the relationship itself provides one (rare). We never invent
 * timestamps — the linked original lets the listener hear where it lands.
 */

import { lookupCatalog } from "@/lib/samples-catalog";

const UA = "Pulsar/1.0 ( https://pulsar-ten-sigma.vercel.app )";

interface SampleRef {
  role: "samples" | "sampledBy";
  title: string;
  artist: string | null;
  year: string | null;
  partial: boolean;
  timestamp: string | null;
  description: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function creditToName(credit: any[]): string | null {
  if (!Array.isArray(credit)) return null;
  const name = credit.map((c) => `${c.name ?? c.artist?.name ?? ""}${c.joinphrase ?? ""}`).join("");
  return name.trim() || null;
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
    //    and sample relationships are attached per-recording — often to only
    //    one of them. Checking just the top hit was the main reason coverage
    //    looked so thin; we now merge relationships across several.
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

    // 2) Pull sample relationships from each, in parallel.
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
      if (!rel.type || !/sampl/i.test(rel.type)) continue;
      const target = rel.recording ?? rel.work;
      if (!target?.title) continue;
      const role: SampleRef["role"] = rel.direction === "backward" ? "sampledBy" : "samples";
      const tArtist = creditToName(rel.recording?.["artist-credit"]);
      const year =
        (rel.recording?.["first-release-date"] || rel.begin || "")?.slice(0, 4) || null;
      const attrs: string[] = Array.isArray(rel.attributes) ? rel.attributes : [];
      const partial = attrs.some((a) => /partial/i.test(a));
      // Merging across several recordings means the same connection can appear
      // more than once — keep one entry per (role, title, artist).
      const dedupeKey = `${role}|${target.title}|${tArtist ?? ""}`.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const byline = tArtist ? ` by ${tArtist}` : "";
      const description =
        role === "samples"
          ? `Samples “${target.title}”${byline}`
          : `Sampled in “${target.title}”${byline}`;
      samples.push({
        role,
        title: target.title,
        artist: tArtist,
        year,
        partial,
        // MusicBrainz relationships carry no in-song timecodes. We never invent
        // one — the UI lets a listener mark it instead.
        timestamp: null,
        description,
      });
    }

    // Songs this one samples first (the classic "what's the sample?" question).
    samples.sort((a, b) => (a.role === b.role ? 0 : a.role === "samples" ? -1 : 1));

    return NextResponse.json(
      { samples },
      { headers: { "Netlify-Vary": "query", "Cache-Control": "public, max-age=604800" } }
    );
  } catch {
    // MusicBrainz unreachable — still return the curated hits.
    return NextResponse.json({ samples }, { status: 200 });
  }
}
