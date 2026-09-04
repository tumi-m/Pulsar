import { NextRequest, NextResponse } from "next/server";
import { getReleases, getTodaysReleases } from "@/lib/supabase";

export const runtime = "nodejs";
export const revalidate = 300; // 5 minutes

const MAX_LIMIT = 100;

function parseLimit(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, MAX_LIMIT);
}

function parseParam(raw: string | null): string | undefined {
  if (raw == null) return undefined;
  const v = raw.trim().slice(0, 64);
  return v ? v : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mood = parseParam(searchParams.get("mood"));
    const date = parseParam(searchParams.get("date"));
    const today = searchParams.get("today");
    const limit = parseLimit(searchParams.get("limit"));

    let releases;
    if (today === "true") {
      releases = await getTodaysReleases();
    } else {
      releases = await getReleases({ mood, date, limit });
    }

    return NextResponse.json(
      { releases, count: releases.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    console.error("GET /api/releases error:", err);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}
