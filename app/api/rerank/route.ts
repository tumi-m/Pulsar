import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/rerank
 *
 * The second half of retrieve-then-rerank.
 *
 * /api/ask turns the request into structured signals, and lib/selector.ts
 * scores every release against them — but that scorer only ever compares
 * strings. It cannot know that Burial answers "melancholic, late night, rainy"
 * better than a record that merely has those words in its tags, because it has
 * no idea what either record sounds like.
 *
 * So the shortlist comes from the scorer (fast, deterministic, covers the whole
 * catalogue) and the ORDER of the top of it comes from the model, which is
 * shown the actual candidates and asked which ones genuinely answer the
 * request. That is the part that makes results sound like the description
 * rather than merely match its keywords.
 *
 * Failure is always non-fatal: any error, timeout, or malformed answer returns
 * `order: null` and the caller keeps the scorer's ranking. A slow model must
 * never mean no recommendations.
 */

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? "").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL ?? "deepseek-v4-flash:0731-cloud";
const API_KEY = process.env.OLLAMA_API_KEY;

/** Enough to reorder meaningfully without an unwieldy prompt. */
const MAX_CANDIDATES = 40;

export interface RerankCandidate {
  artist: string;
  title: string;
  genre?: string | null;
  year?: string | null;
  tags?: string[];
}

const SYSTEM = `You are Pulsar's Selector, ranking records against a listener's request.

You are given the request and a numbered list of candidate releases. Return
STRICT JSON (no markdown, no prose):
{"order": number[], "drop": number[]}

- "order": the indexes of records that genuinely answer the request, BEST FIRST.
- "drop": indexes that do not belong at all, however well they match on paper.

Judge by how the music ACTUALLY SOUNDS, using what you know of these artists and
records — not by whether words in the request appear in the title or tags. A
record called "Rainy Day Anthem" is not automatically right for "something for a
rainy day", and a record whose tags say "house" is not right for "euphoric
house" if you know it is a downbeat record.

Weigh, in order: does it sound the way the listener described; does it fit the
stated setting or activity; is the era right if one was named. A famous record
is not a better answer than an obscure one — fit is the only criterion.

Be decisive. Put things you are confident about at the top, and use "drop" for
genuine mismatches rather than burying them. You may leave an index out of both
lists if you are unsure; those keep their original position. Never invent an
index that was not given to you.`;

interface Body {
  prompt?: string;
  candidates?: RerankCandidate[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const prompt = (body.prompt ?? "").trim().slice(0, 500);
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.slice(0, MAX_CANDIDATES)
    : [];

  const passthrough = (reason: string) =>
    NextResponse.json(
      { order: null, drop: [], reason },
      { headers: { "Cache-Control": "no-store" } }
    );

  if (!prompt || candidates.length === 0) return passthrough("empty");
  if (!BASE_URL || !API_KEY) return passthrough("no-model");

  // One line per candidate. Descriptors are included because they are often the
  // only thing distinguishing two records of the same genre.
  const list = candidates
    .map((c, i) => {
      const bits = [
        `${i}. ${c.artist} — ${c.title}`,
        c.genre ? `[${c.genre}]` : "",
        c.year ? `(${c.year})` : "",
        c.tags?.length ? `tags: ${c.tags.slice(0, 8).join(", ")}` : "",
      ].filter(Boolean);
      return bits.join(" ");
    })
    .join("\n");

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
        // Low temperature: this is a judgement, not a creative task, and it
        // should be stable enough that the same request twice looks the same.
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Request: ${prompt}\n\nCandidates:\n${list}` },
        ],
      }),
      // Generous but bounded. Past this the scorer's order is served instead —
      // a slower answer is worse than a good-enough instant one.
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return passthrough(`model-${res.status}`);

    const data = await res.json();
    const raw: string = data?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return passthrough("unparseable");
    const parsed = JSON.parse(match[0]);

    // Validate hard: only in-range integers, de-duplicated. A hallucinated
    // index would silently reorder to the wrong record.
    const clean = (v: unknown): number[] => {
      if (!Array.isArray(v)) return [];
      const seen = new Set<number>();
      const out: number[] = [];
      for (const n of v) {
        const i = typeof n === "number" ? n : Number(n);
        if (!Number.isInteger(i) || i < 0 || i >= candidates.length) continue;
        if (seen.has(i)) continue;
        seen.add(i);
        out.push(i);
      }
      return out;
    };

    const order = clean(parsed.order);
    const dropSet = new Set(clean(parsed.drop));
    // Anything the model neither ranked nor dropped keeps its original
    // position, appended after the ranked ones.
    const ranked = order.filter((i) => !dropSet.has(i));
    if (ranked.length === 0) return passthrough("empty-order");

    return NextResponse.json(
      { order: ranked, drop: [...dropSet], model: MODEL, reason: "ok" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return passthrough("unreachable");
  }
}
