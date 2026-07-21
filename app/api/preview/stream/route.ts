import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/preview/stream?src=<encoded mp3 url>
 *
 * Streams a preview MP3 from an allow-listed music CDN with permissive
 * CORS + audio headers, so the browser's Web Audio AnalyserNode can read
 * the waveform for the visualizer. The host allowlist prevents this from
 * being used as an open proxy (SSRF).
 */

const ALLOWED = [
  /(^|\.)mzstatic\.com$/,
  /(^|\.)itunes\.apple\.com$/,
  /(^|\.)apple\.com$/,
  /(^|\.)dzcdn\.net$/,
  /(^|\.)deezer\.com$/,
];

export async function GET(req: NextRequest) {
  const src = new URL(req.url).searchParams.get("src");
  if (!src) return NextResponse.json({ error: "src required" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ error: "invalid src" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED.some((re) => re.test(target.hostname))) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "audio/mpeg,audio/*" },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, immutable",
        "Netlify-Vary": "query",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "stream failed" }, { status: 502 });
  }
}
