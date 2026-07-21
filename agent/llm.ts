/**
 * Pulsar — Open-model curation via Ollama
 *
 * Adds the "editorial" layer to releases already fetched from the live
 * feed: a one-sentence curator note + a mood tag. This is pure text
 * generation — no tools, no browsing — which open models handle well and
 * which carries zero risk of hallucinated links (links come from the feed).
 *
 * Works with:
 *   • Local Ollama       OLLAMA_BASE_URL=http://localhost:11434  (default)
 *   • Ollama Cloud/Turbo OLLAMA_BASE_URL=https://ollama.com  + OLLAMA_API_KEY
 *
 * If Ollama is unreachable, enrichment is skipped gracefully and releases
 * are saved without notes — the ingest never fails because of the model.
 */

import type { Release, MoodTag } from "../lib/types";

const MOODS: MoodTag[] = [
  "euphoric",
  "melancholic",
  "energetic",
  "ambient",
  "raw",
  "cinematic",
  "hypnotic",
  "tender",
];

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";
const API_KEY = process.env.OLLAMA_API_KEY;
const ENRICH_LIMIT = parseInt(process.env.ENRICH_LIMIT ?? "30", 10);
const CONCURRENCY = parseInt(process.env.ENRICH_CONCURRENCY ?? "3", 10);

const SYSTEM_PROMPT = `You are Pulsar — a world-class music curator with the taste of a veteran critic who has heard everything and is still capable of genuine awe.

For the release you are given, return STRICT JSON (no markdown, no prose) with exactly these fields:
{
  "curator_note": "One vivid sentence. Specific and evocative. Never use clichés like 'boundary-pushing', 'genre-defying', 'sonic journey', or 'must-listen'. Make the reader feel the music before they press play.",
  "mood": "one of: euphoric | melancholic | energetic | ambient | raw | cinematic | hypnotic | tender"
}`;

interface Enrichment {
  curator_note: string;
  mood: MoodTag;
}

/** True when Ollama is configured/reachable enough to attempt enrichment. */
export function isLLMConfigured(): boolean {
  // Local default is always "configured"; a probe in enrichReleases decides
  // whether it's actually reachable.
  return Boolean(BASE_URL);
}

async function chat(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.85 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.message?.content ?? null;
  } catch {
    return null;
  }
}

function parseEnrichment(raw: string | null): Enrichment | null {
  if (!raw) return null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    const note = typeof obj.curator_note === "string" ? obj.curator_note.trim() : "";
    const mood = MOODS.includes(obj.mood) ? (obj.mood as MoodTag) : null;
    if (!note) return null;
    return { curator_note: note, mood: mood ?? "cinematic" };
  } catch {
    return null;
  }
}

async function enrichOne(r: Release): Promise<Release> {
  const prompt = `Artist: ${r.artist}
Title: ${r.title}
Type: ${r.type}
Genre: ${r.genre ?? "unknown"}

Write the curator_note and mood for this release.`;
  const enrichment = parseEnrichment(await chat(prompt));
  if (!enrichment) return r;
  return { ...r, curator_note: enrichment.curator_note, mood: enrichment.mood };
}

/** Run `fn` over `items` with a fixed concurrency pool. */
async function mapPool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

/**
 * Enrich the newest `ENRICH_LIMIT` releases with curator notes + moods.
 * Releases beyond the limit (and any the model can't handle) pass through
 * unchanged. Returns the full list in the original order.
 */
export async function enrichReleases(releases: Release[]): Promise<{
  releases: Release[];
  enriched: number;
  reachable: boolean;
}> {
  if (releases.length === 0) return { releases, enriched: 0, reachable: false };

  // Probe reachability once with the first release.
  const probe = await enrichOne(releases[0]);
  const reachable = probe.curator_note !== releases[0].curator_note;
  if (!reachable) {
    console.log(
      `ℹ️  Ollama not reachable at ${BASE_URL} (model: ${MODEL}) — saving without curator notes.`
    );
    return { releases, enriched: 0, reachable: false };
  }

  const head = releases.slice(0, ENRICH_LIMIT);
  const tail = releases.slice(ENRICH_LIMIT);
  const enrichedHead = [probe, ...(await mapPool(head.slice(1), CONCURRENCY, enrichOne))];
  const enriched = enrichedHead.filter((r) => r.curator_note).length;

  console.log(`   ✍️  Enriched ${enriched}/${head.length} releases via ${MODEL}.`);
  return { releases: [...enrichedHead, ...tail], enriched, reachable: true };
}
