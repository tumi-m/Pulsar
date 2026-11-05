/**
 * Pulsar — share/title card text rules.
 *
 * Shared by the browser (which trims a crate to fit before posting it) and
 * the server (which refuses anything that doesn't fit). Keeping both on one
 * set of limits and one clip function is what stops a perfectly ordinary
 * crate — a 140-character remix title, a dozen records — from coming back as
 * a 400 the listener can do nothing about.
 *
 * No Node or DOM imports: this file ships in the client chunk.
 */

export const CARD_LIMITS = {
  name: 80,
  title: 120,
  artist: 120,
  /** Records drawn on the crate card. The count line still says the real total. */
  records: 8,
  /** Title card subtitle (label · year · format). */
  meta: 80,
  eyebrow: 40,
} as const;

/* C0/C1 controls and the bidi embedding/override/isolate characters. A crate
   name pasted from somewhere else can carry these invisibly, and an override
   would reorder the rest of the line on the card. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Strip control characters and collapse runs of whitespace to one space. */
export function tidy(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
}

/**
 * Tidy, then cut to at most `max` UTF-16 units ending on an ellipsis.
 *
 * Measured in UTF-16 units because that is what zod's `.max()` counts on the
 * server — clipping by code points could still send an emoji-heavy title one
 * unit over and get it refused. The cut never splits a surrogate pair, which
 * would leave a lone half that renders as a replacement box.
 */
export function clip(value: unknown, max: number): string {
  const flat = tidy(value);
  if (flat.length <= max) return flat;
  let end = Math.max(0, max - 1);
  const code = flat.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${flat.slice(0, end).trimEnd()}…`;
}

/** "1 RECORD" / "12 RECORDS" / "EMPTY CRATE" — the LCD readout on the card. */
export function recordCount(total: number): string {
  if (total <= 0) return "EMPTY CRATE";
  return `${total} RECORD${total === 1 ? "" : "S"}`;
}

/**
 * A filename that survives every OS's download folder: letters and digits in
 * any script kept, everything else folded to single dashes.
 */
export function cardFilename(name: string): string {
  const slug = tidy(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "crate"}-pulsar.png`;
}
