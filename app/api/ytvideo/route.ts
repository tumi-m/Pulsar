import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/ytvideo?artist=...&title=...
 *
 * Resolves the first YouTube video id for "<artist> <title>" by reading the
 * public search results page (keyless). The visualizer then embeds
 * https://www.youtube.com/embed/<id> so users can watch the music video for
 * free inside the visualiser. Returns { videoId: string | null }.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);

  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required" }, { status: 400 });
  }

  try {
    const q = encodeURIComponent(`${artist} ${title} official video`);
    const res = await fetch(`https://www.youtube.com/results?search_query=${q}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 }, // a music video rarely changes
    });
    if (!res.ok) throw new Error("youtube search failed");
    const html = await res.text();
    // The first "videoId":"XXXXXXXXXXX" in the ytInitialData blob is the top hit.
    const match = html.match(/"videoId":"([\w-]{11})"/);
    const videoId = match ? match[1] : null;
    return NextResponse.json(
      { videoId },
      { headers: { "Netlify-Vary": "query", "Cache-Control": "public, max-age=86400" } }
    );
  } catch {
    return NextResponse.json({ videoId: null }, { status: 200 });
  }
}
