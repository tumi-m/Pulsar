#!/usr/bin/env tsx
/**
 * Pulsar — Daily Ingest Job
 *
 * The reliable, zero-cost daily agent. Pulls new releases from Apple's
 * free Marketing Tools RSS feeds (no API key) and upserts them into
 * Supabase so the catalog grows every day with fresh, real releases —
 * each with artwork and five streaming links.
 *
 * Run:        npm run ingest
 * Scheduled:  GitHub Actions / cron (see .github/workflows/daily-agent.yml)
 *
 * This needs ONLY the Supabase env vars. The Claude-powered discovery
 * agent (agent/index.ts) remains available as an optional richer path
 * when ANTHROPIC_API_KEY + a search API are configured.
 */

import { getLiveFeed } from "../lib/feed";
import { saveRelease, supabaseAdmin } from "../lib/supabase";
import { config } from "./env";

config();

export interface IngestResult {
  found: number;
  saved: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}

export async function runIngest(): Promise<IngestResult> {
  const start = Date.now();
  console.log(`\n${"─".repeat(56)}`);
  console.log(`🎵 PULSAR — Daily Ingest`);
  console.log(`   Started: ${new Date().toISOString()}`);
  console.log(`${"─".repeat(56)}\n`);

  // If Supabase isn't configured there's nothing to persist to. Treat this
  // as a clean no-op (NOT a failure) so scheduled runs never error out.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.log(
      "ℹ️  Supabase not configured — skipping ingest (the live site still\n" +
        "   shows fresh music from the Apple feed without a database).\n"
    );
    return { found: 0, saved: 0, failed: 0, skipped: true, reason: "no-supabase-config" };
  }

  const releases = await getLiveFeed();
  console.log(`Fetched ${releases.length} releases from the live feed.\n`);

  let saved = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of releases) {
    try {
      await saveRelease({
        artist: r.artist,
        title: r.title,
        type: r.type,
        artwork_url: r.artwork_url,
        release_date: r.release_date,
        genre: r.genre ?? undefined,
        tags: r.tags,
        mood: r.mood ?? undefined,
        spotify: r.spotify,
        apple_music: r.apple_music,
        tidal: r.tidal,
        soundcloud: r.soundcloud,
        youtube_music: r.youtube_music,
        curator_note: r.curator_note ?? undefined,
      });
      saved++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      if (errors.length < 5) errors.push(`${r.artist} — ${r.title}: ${msg}`);
    }
  }

  const durationMs = Date.now() - start;
  console.log(`\n${"─".repeat(56)}`);
  console.log(`✅ Ingest complete`);
  console.log(`   Saved:   ${saved}`);
  console.log(`   Failed:  ${failed}`);
  console.log(`   Duration: ${(durationMs / 1000).toFixed(1)}s`);
  if (errors.length) console.log(`   First errors:\n     ${errors.join("\n     ")}`);
  console.log(`${"─".repeat(56)}\n`);

  // Best-effort audit log (ignored if agent_runs table / creds absent)
  try {
    await supabaseAdmin().from("agent_runs").insert({
      releases_found: releases.length,
      releases_saved: saved,
      errors,
      duration_ms: durationMs,
      success: saved > 0,
    });
  } catch {
    /* non-fatal */
  }

  return { found: releases.length, saved, failed, skipped: false };
}

// CLI entry — only when run directly (not when imported by the API route).
// A completed run is a SUCCESS (exit 0) even if it saved 0 (feed empty, all
// duplicates, or unconfigured) — the scheduled job only errors on a genuine
// crash, so it never emails you a "failed run" for a normal quiet day.
if (process.argv[1] && /ingest\.ts$/.test(process.argv[1])) {
  runIngest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Ingest fatal error:", err);
      process.exit(1);
    });
}
