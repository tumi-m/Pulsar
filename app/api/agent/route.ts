import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Verify secret to prevent unauthorized triggers
  const authHeader = req.headers.get("authorization");
  const expectedSecret = `Bearer ${process.env.AGENT_TRIGGER_SECRET}`;

  if (!process.env.AGENT_TRIGGER_SECRET || authHeader !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Reliable path: ingest fresh releases from the free Apple RSS feeds
    // into Supabase. Needs only the Supabase service key.
    const { runIngest } = await import("@/agent/ingest");
    const result = await runIngest();

    return NextResponse.json({
      success: result.saved > 0,
      releases_found: result.found,
      releases_saved: result.saved,
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

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "pulsar-agent",
    timestamp: new Date().toISOString(),
  });
}
