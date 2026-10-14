import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rate-limit";
import { cardBody } from "@/lib/cards/schema";
import { renderCrateCard } from "@/lib/cards/crate-card";
import { renderTitleCard } from "@/lib/cards/title-card";

export const runtime = "nodejs";

/**
 * POST /api/card
 *
 * Draws a share card (a crate, 1080×1350) or a release title card (1920×1080)
 * as SVG with Satori. The browser rasterises the crate card to a PNG for the
 * share sheet; the SVG never needs a font on the viewer's side because every
 * glyph is embedded as an outline.
 *
 *   { kind: "crate", name, records: [{ title, artist }], total? }
 *   { kind: "title", title, artist, meta?, eyebrow?, variant? }
 *
 * Node runtime because the fonts are read from disk (lib/cards/fonts.ts) —
 * next.config.ts traces them into this function's bundle.
 */

/** A full 8-record body is ~3 KB even in a four-byte script; this is generous. */
const MAX_BODY_BYTES = 16 * 1024;

const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  // A render is ~10–50ms of CPU; enough to want a ceiling on an open route,
  // generous enough that tapping Share card a few times never meets it.
  const limited = guard(req, "card", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  // JSON only. Besides being the contract, it keeps a cross-site <form> (which
  // can only send form or text/plain bodies) from navigating a visitor to a
  // card drawn from the attacker's text.
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return bad("Send the card as application/json", 415);
  }

  // The declared length turns a huge body away before it is read; the measured
  // one catches a chunked body that declared nothing.
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) return bad("Card request too large", 413);
  const raw = await req.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return bad("Card request too large", 413);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return bad("Body is not valid JSON");
  }

  const parsed = cardBody.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return bad(first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid card request");
  }

  const body = parsed.data;
  let svg: string;
  try {
    svg =
      body.kind === "crate"
        ? await renderCrateCard({ name: body.name, records: body.records, total: body.total })
        : await renderTitleCard(body);
  } catch (err) {
    console.error("[api/card] render failed", err);
    return bad("Could not draw the card", 500);
  }

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Drawn from one listener's crate in answer to a POST: nothing a shared
      // cache should keep or a later request could reuse.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Satori emits only shapes and outlined glyphs, but an SVG served from
      // this origin is a document if opened directly; never let it run anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
