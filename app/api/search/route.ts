import { NextRequest, NextResponse } from "next/server";
import { searchReleases } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/search?q=...
 *
 * Server-side search across the full Supabase archive (which grows daily and
 * can be far larger than the homepage's 2000-release client payload). Returns
 * matching releases newest-first. Falls back to an empty list on any error so
 * the grid simply shows its local results instead of breaking.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ releases: [], count: 0 });

  try {
    const releases = await searchReleases(q, 60);
    return NextResponse.json(
      { releases, count: releases.length },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  } catch {
    return NextResponse.json({ releases: [], count: 0 });
  }
}
