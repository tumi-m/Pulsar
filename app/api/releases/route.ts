import { NextRequest, NextResponse } from "next/server";
import { getReleases, getTodaysReleases } from "@/lib/supabase";

export const runtime = "edge";
export const revalidate = 300; // 5 minutes

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mood = searchParams.get("mood") ?? undefined;
    const date = searchParams.get("date") ?? undefined;
    const today = searchParams.get("today");
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : undefined;

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
