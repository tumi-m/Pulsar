import { NextRequest, NextResponse } from "next/server";
import { pinnedVideoId } from "@/lib/samples-media";

export const runtime = "nodejs";

/**
 * GET /api/ytvideo?artist=...&title=...[&kind=live]
 *
 * Resolves a YouTube video id for "<artist> <title>". Returns
 * `{ videoId, reason }` — the reason matters, because the previous version of
 * this route made every distinct failure look identical to "this record has no
 * video", and that is what killed the samples feature.
 *
 * WHAT WAS ACTUALLY WRONG
 *
 * The old implementation scraped youtube.com/results and regexed the first
 * `"videoId":"…"` out of the HTML. On Vercel that fails in three compounding
 * ways at once:
 *
 *   1. Serverless functions egress from datacenter IP ranges. YouTube serves
 *      those a consent interstitial or a CAPTCHA rather than results.
 *   2. That interstitial comes back as HTTP **200**, so the `if (!res.ok)`
 *      guard never fired. The regex simply found nothing.
 *   3. Both the "no match" path and the `catch` returned
 *      `{ videoId: null }` with status 200 — indistinguishable from a genuine
 *      "no such video". The client showed "No video found" forever and no
 *      diagnostic was recorded anywhere.
 *
 * And when the scrape *did* work it was still unsafe: the first videoId in
 * ytInitialData is frequently a promoted slot or a "people also watched" item
 * rather than the top organic result, so it could return a confidently wrong
 * video. For a sample-comparison feature, playing the wrong record is a worse
 * outcome than playing none.
 *
 * WHAT IT DOES NOW
 *
 *   1. Curated id first — `lib/samples-media.ts` carries hand-checked ids for
 *      the connections we ship. No network, no failure mode.
 *   2. YouTube Data API v3 `search.list` when YOUTUBE_API_KEY is configured.
 *      This is the only supported way to turn a query into a video id;
 *      `embed?listType=search` has returned 4xx since 15 Nov 2020.
 *   3. Otherwise: no guess. `videoId: null` with a reason the UI can act on.
 *
 * The scrape is gone. It cannot be made reliable from a datacenter IP, and a
 * silent wrong answer is worse than an honest "not configured".
 */

export type YtVideoReason =
  /** Served from the curated catalogue. */
  | "pinned"
  /** Resolved through the Data API. */
  | "api"
  /** No curated id and no API key — nothing to resolve with. */
  | "no-key"
  /** API key present but the call failed (quota, bad key, network). */
  | "api-error"
  /** The API ran and genuinely returned nothing. */
  | "not-found"
  | "bad-request";

export interface YtVideoResponse {
  videoId: string | null;
  reason: YtVideoReason;
}

const isVideoId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{11}$/.test(v);

async function fromDataApi(
  query: string,
  key: string
): Promise<{ videoId: string | null; reason: YtVideoReason }> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "1",
    // Only offer videos that are actually allowed to play in an iframe —
    // otherwise the embed renders "playback on other websites is disabled".
    videoEmbeddable: "true",
    q: query,
    key,
  });
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      signal: AbortSignal.timeout(8000),
      // A given artist+title resolves to the same video essentially forever.
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return { videoId: null, reason: "api-error" };
    const data = await res.json();
    const id = data?.items?.[0]?.id?.videoId;
    return isVideoId(id)
      ? { videoId: id, reason: "api" }
      : { videoId: null, reason: "not-found" };
  } catch {
    return { videoId: null, reason: "api-error" };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);
  const kind = searchParams.get("kind") === "live" ? "live" : "video";

  if (!artist || !title) {
    return NextResponse.json<YtVideoResponse>(
      { videoId: null, reason: "bad-request" },
      { status: 400 }
    );
  }

  // 1. Curated. Live performances are never curated, so skip for kind=live.
  if (kind === "video") {
    const pinned = pinnedVideoId(artist, title);
    if (pinned) {
      return NextResponse.json<YtVideoResponse>(
        { videoId: pinned, reason: "pinned" },
        { headers: { "Cache-Control": "public, max-age=86400" } }
      );
    }
  }

  // 2. Data API, if the deployment has a key.
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    // no-store: the moment a key is added this must start resolving, and a
    // cached "nothing" would keep the feature dead for a day.
    return NextResponse.json<YtVideoResponse>(
      { videoId: null, reason: "no-key" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const suffix = kind === "live" ? " live performance" : "";
  const { videoId, reason } = await fromDataApi(`${artist} ${title}${suffix}`, key);

  return NextResponse.json<YtVideoResponse>(
    { videoId, reason },
    {
      headers: {
        // Only cache a real answer. Caching a transient failure for a day is
        // how a five-minute quota blip became a day-long outage.
        "Cache-Control": videoId ? "public, max-age=86400" : "no-store",
      },
    }
  );
}
