import { NextResponse } from "next/server";
import { supabaseAdmin, cleanUrl } from "@/lib/supabase";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * GET /api/health
 *
 * Operational snapshot for monitoring: is Supabase configured and reachable,
 * how many releases are stored, and how stale the catalogue is (days since
 * the newest release_date). 200 even when degraded — the payload carries the
 * state; a monitor can alert on `status !== "ok"` or `stalenessDays > 3`.
 */
export async function GET() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!configured) {
    return NextResponse.json({
      status: "degraded",
      supabase: false,
      note: "Supabase env vars not configured — site runs on the live feed",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const db = supabaseAdmin();
    const [countRes, latestRes] = await Promise.all([
      db.from("releases").select("id", { count: "exact", head: true }),
      db
        .from("releases")
        .select("release_date")
        .order("release_date", { ascending: false })
        .limit(1),
    ]);

    if (countRes.error) throw new Error(countRes.error.message);

    const latest = (latestRes.data as { release_date: string }[] | null)?.[0]?.release_date ?? null;
    const stalenessDays = latest
      ? Math.floor((Date.now() - new Date(latest).getTime()) / 86_400_000)
      : null;

    return NextResponse.json({
      status: "ok",
      supabase: true,
      origin: cleanUrl() || null,
      releaseCount: countRes.count ?? 0,
      latestReleaseDate: latest,
      stalenessDays,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      status: "degraded",
      supabase: true,
      note: err instanceof Error ? err.message : "Supabase query failed",
      timestamp: new Date().toISOString(),
    });
  }
}