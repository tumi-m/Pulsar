import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_TRIGGER_SECRET;
  if (!secret) return false;
  // Vercel Crons issue GET with no custom headers, so accept the secret as a
  // query param as well as the Authorization header (manual/CI path).
  const header = req.headers.get("authorization");
  const param = new URL(req.url).searchParams.get("secret");
  return header === `Bearer ${secret}` || param === secret;
}

export async function POST(req: NextRequest) {
  // Ingest is a long Supabase write burst — don't let one IP spam it.
  const limited = guard(req, "agent", { limit: 5, windowMs: 3_600_000 });
  if (limited) return limited;

  // Verify secret to prevent unauthorized triggers
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
    return NextResponse.json(
      {
        error: "Ingest run failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// Health check — doubles as the Vercel Cron entrypoint (crons issue GET).
// Pass ?secret=$AGENT_TRIGGER_SECRET (or the Authorization header) to run ingest.
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
