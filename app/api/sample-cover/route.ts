import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/sample-cover?mbid=<recording-id>
 *
 * Artwork for a sampled/original track via the Cover Art Archive (CAA —
 * MusicBrainz's openly-licensed artwork service). CAA is keyed by release /
 * release-group ids, so a recording mbid is first resolved to its release
 * group, then the front-250 thumbnail URL is verified to exist before being
 * handed to the client. 404 when nothing is available — the caller falls back
 * to the iTunes proxy.
 */
const UA = "Pulsar/1.0 ( https://pulsar-ten-sigma.vercel.app )";

export async function GET(req: NextRequest) {
  const mbid = req.nextUrl.searchParams.get("mbid")?.trim();
  if (!mbid || !/^[a-f0-9-]{36}$/i.test(mbid)) {
    return NextResponse.json({ url: null }, { status: 400 });
  }

  try {
    // recording → release-groups
    const recRes = await fetch(
      `https://musicbrainz.org/ws/2/recording/${mbid}?inc=release-groups&fmt=json`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000), next: { revalidate: 2592000 } }
    );
    if (!recRes.ok) throw new Error("mb lookup failed");
    const rec = await recRes.json();
    const rg = (rec["release-groups"] ?? []).find(
      (g: { id?: string; "secondary-types"?: string[] }) =>
        g.id && !(g["secondary-types"] ?? []).some((t) => /compilation|live/i.test(t))
    ) ?? (rec["release-groups"] ?? [])[0];
    if (!rg?.id) throw new Error("no release group");

    // Verify the front cover actually exists (CAA 404s for the long tail).
    const url = `https://coverartarchive.org/release-group/${rg.id}/front-250`;
    const artRes = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000) });
    if (!artRes.ok) throw new Error("no cover");

    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "public, max-age=2592000, immutable" } }
    );
  } catch {
    return NextResponse.json({ url: null }, { status: 404 });
  }
}