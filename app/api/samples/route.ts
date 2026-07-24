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

  try {
    // 1) Find the best-matching recording.
    const query = encodeURIComponent(`artist:"${artist}" AND recording:"${title}"`);
    const searchRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=3`,
      { headers, signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } }
    );
    if (!searchRes.ok) throw new Error("mb search failed");
    const searchData = await searchRes.json();
    const rec = (searchData.recordings ?? []).find((r: any) => (r.score ?? 0) >= 80) ?? searchData.recordings?.[0];
    if (!rec?.id) return NextResponse.json({ samples: [] });

    // 2) Pull its sample relationships.
    const relRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/${rec.id}?inc=recording-rels+work-rels+artist-credits&fmt=json`,
      { headers, signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } }
    );
    if (!relRes.ok) throw new Error("mb rels failed");
    const relData = await relRes.json();

    const samples: SampleRef[] = [];
    for (const rel of relData.relations ?? []) {
      if (!rel.type || !/sampl/i.test(rel.type)) continue;
      const target = rel.recording ?? rel.work;
      if (!target?.title) continue;
      const role: SampleRef["role"] = rel.direction === "backward" ? "sampledBy" : "samples";
      const tArtist = creditToName(rel.recording?.["artist-credit"]);
      const year =
        (rel.recording?.["first-release-date"] || rel.begin || "")?.slice(0, 4) || null;
      const attrs: string[] = Array.isArray(rel.attributes) ? rel.attributes : [];
      const partial = attrs.some((a) => /partial/i.test(a));
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
    return NextResponse.json({ samples: [] }, { status: 200 });
  }
}
