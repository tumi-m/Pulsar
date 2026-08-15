import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/ask
 *
 * The agentic Selector: turns a free-form vibe prompt ("dreamy chillwave for a
 * late-night drive") into structured signals the recommender can filter on —
 * moods, genres, decades — using the configured Ollama model. Falls through to
 * the caller's keyword matcher when Ollama is unreachable, so the feature
 * never breaks.
 *
 * The model is asked for STRICT JSON only; we parse defensively and clamp to
 * the values the rest of the app understands.
 */

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? "").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL ?? "deepseek-v4-flash:0731-cloud";
const API_KEY = process.env.OLLAMA_API_KEY;

const MOODS = [
  "euphoric", "melancholic", "energetic", "ambient",
  "raw", "cinematic", "hypnotic", "tender",
] as const;

const SYSTEM = `You are Pulsar's music Selector. From the user's free-form request, extract the listening signals as STRICT JSON (no markdown, no prose):
{"moods": string[], "genres": string[], "decades": string[], "freeText": string}
- moods: only from ${JSON.stringify(MOODS)}
- genres: short genre names (e.g. "hip-hop", "afrobeats", "house", "ambient", "rock", "soul")
- decades: 4-digit decade strings like "1990", "2000", "2020" (empty if none)
- freeText: any remaining descriptive keywords not captured above
If a field has nothing, return an empty array. Never invent fields.`;

export async function POST(req: NextRequest) {
  const { prompt } = (await req.json().catch(() => ({}))) as { prompt?: string };
  const text = (prompt ?? "").trim().slice(0, 500);
  if (!text) return NextResponse.json({ moods: [], genres: [], decades: [], freeText: "" }, { headers: { "Cache-Control": "no-store" } });
  if (!BASE_URL || !API_KEY) {
    // No cloud model configured — caller falls back to keyword parsing.
    return NextResponse.json({ moods: [], genres: [], decades: [], freeText: text }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.4 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return NextResponse.json({ moods: [], genres: [], decades: [], freeText: text }, { headers: { "Cache-Control": "no-store" } });
    const data = await res.json();
    const raw = data?.message?.content;
    const match = typeof raw === "string" ? raw.match(/\{[\s\S]*\}/) : null;
    if (!match) return NextResponse.json({ moods: [], genres: [], decades: [], freeText: text }, { headers: { "Cache-Control": "no-store" } });
    const obj = JSON.parse(match[0]);
    const moods = (Array.isArray(obj.moods) ? obj.moods : []).filter((m: unknown) =>
      MOODS.includes(m as (typeof MOODS)[number])
    );
    return NextResponse.json({
      moods,
      genres: Array.isArray(obj.genres) ? obj.genres.slice(0, 8) : [],
      decades: (Array.isArray(obj.decades) ? obj.decades : []).filter((d: unknown) => /^\d{4}$/.test(String(d))),
      freeText: typeof obj.freeText === "string" ? obj.freeText : text,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ moods: [], genres: [], decades: [], freeText: text }, { headers: { "Cache-Control": "no-store" } });
  }
}