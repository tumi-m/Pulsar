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
    // Dynamically import to avoid loading agent code in edge runtime
    const { runMusicDiscoveryAgent } = await import("@/agent/index");
    const result = await runMusicDiscoveryAgent();

    return NextResponse.json(result);
  } catch (err) {
    console.error("Agent trigger error:", err);
    return NextResponse.json(
      {
        error: "Agent run failed",
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
