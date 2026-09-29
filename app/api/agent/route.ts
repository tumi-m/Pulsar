import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rate-limit";
import { timingSafeEqual } from "@/lib/crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Trigger auth accepts either secret:
 *   • AGENT_TRIGGER_SECRET — the operator/admin secret (header only)
 *   • CRON_SECRET          — Vercel Crons send `Authorization: Bearer $CRON_SECRET`
 *                            without any custom configuration
 *
 * The secret is NEVER accepted as a query parameter: URLs land in access
 * logs, proxy logs, browser history and Referer headers.
 */
function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const presented = header.slice(7);

  const adminSecret = process.env.AGENT_TRIGGER_SECRET;
  if (adminSecret && timingSafeEqual(presented, adminSecret)) return true;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && timingSafeEqual(presented, cronSecret)) return true;

  return false;
}

export async function POST(req: NextRequest) {
  // Ingest is a long Supabase write burst — don't let one IP spam it.
  const limited = guard(req, "agent", { limit: 5, windowMs: 3_600_000 });
  if (limited) return limited;

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runIngestResponse();
}

async function runIngestResponse() {
  try {
    // Reliable path: ingest fresh releases from the free Apple RSS feeds
    // into Supabase. Needs only the Supabase service key.
    const { runIngest } = await import("@/agent/ingest");
    const result = await runIngest();

    return NextResponse.json({
      success: result.saved > 0,
      releases_found: result.found,
      releases_saved: result.saved,
      releases_enriched: result.enriched,
      errors: [],
      run_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Ingest trigger error:", err);
    // Generic body only — internal error text (Supabase/undici internals)
    // must not reach the client. Details live in the server logs.
    return NextResponse.json({ error: "Ingest run failed" }, { status: 500 });
  }
}

// Health check — doubles as the Vercel Cron entrypoint (crons issue GET with
// `Authorization: Bearer $CRON_SECRET`).
export async function GET(req: NextRequest) {
  if (isAuthorized(req)) {
    return runIngestResponse();
  }
  return NextResponse.json({
    status: "ok",
    service: "pulsar-agent",
    timestamp: new Date().toISOString(),
  });
}