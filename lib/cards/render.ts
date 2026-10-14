import satori, { type Font } from "satori";
import type { ReactNode } from "react";
import { loadCardFonts } from "./fonts";
import { fontCodePoints } from "./glyphs";

/**
 * JSX → SVG through Satori, with an honest answer for text it can't draw.
 *
 * The bundled faces cover Latin, Cyrillic, Greek and Vietnamese. A title in
 * Japanese, Arabic or with an emoji has no glyphs in any of them, and Satori's
 * default is a row of .notdef boxes — a J-card reading "□□□" looks broken.
 * So every caller string goes through `fix`, which is first the identity (to
 * collect them) and then, only if one holds a character no face can draw,
 * a filter that removes those characters. A string left with nothing drawable
 * becomes a dash rather than an empty label. Either way Satori runs once.
 *
 * What's drawable comes from the fonts' own cmaps (glyphs.ts), checked for
 * every character. Satori's loadAdditionalAsset can't be the judge: it only
 * hears about a grapheme whose first character is missing, so the U+20E3 of a
 * keycap or a combining underline after a covered letter never reaches it.
 *
 * Every string reaches Satori as a text node and, with fonts embedded, leaves
 * as glyph outlines — nothing the caller sends is ever written into the SVG
 * as markup.
 */

/** Maps a display string to what will actually be drawn. */
export type Fix = (text: string) => string;

const PLACEHOLDER = "—";

/**
 * Every code point any face can draw — Satori falls back across all of them.
 * Keyed by the font array, which loadCardFonts hands every render, so the
 * cmaps are read once per process.
 */
const coverage = new WeakMap<Font[], Set<number>>();

function coverageOf(fonts: Font[]): Set<number> {
  let points = coverage.get(fonts);
  if (!points) {
    points = new Set();
    for (const { data } of fonts) {
      for (const cp of fontCodePoints(data instanceof ArrayBuffer ? new Uint8Array(data) : data)) points.add(cp);
    }
    coverage.set(fonts, points);
  }
  return points;
}

let graphemes: Intl.Segmenter | undefined;

/**
 * The drawable part of `text`, grapheme by grapheme. A cluster whose base
 * can't be drawn goes whole — an emoji with its ZWJs and skin tone, a kanji
 * with an accent on it — so nothing is left dangling. A cluster whose base can
 * be drawn keeps it and loses only the marks no face has: 1️⃣ → 1, e̲ → e.
 */
export function keepDrawable(text: string, points: ReadonlySet<number>): string {
  // Uppercase too: Satori applies textTransform before shaping, and a few
  // letters the fonts have (ǆ, ɐ) uppercase to ones they don't.
  const drawable = (ch: string) =>
    points.has(ch.codePointAt(0)!) && Array.from(ch.toUpperCase()).every((u) => points.has(u.codePointAt(0)!));
  graphemes ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let out = "";
  for (const { segment } of graphemes.segment(text)) {
    const [base, ...rest] = Array.from(segment);
    if (drawable(base)) out += base + rest.filter(drawable).join("");
  }
  return out;
}

export async function renderSvg(
  build: (fix: Fix) => ReactNode,
  size: { width: number; height: number },
): Promise<string> {
  const fonts = await loadCardFonts();
  const points = coverageOf(fonts);

  // Building the tree is cheap; drawing it is the cost. So build once to see
  // the strings, and rebuild only when one of them needs a character removed.
  const strings: string[] = [];
  const tree = build((text) => {
    strings.push(text);
    return text;
  });
  const clean = strings.every((s) => keepDrawable(s, points) === s);

  const drop: Fix = (text) => {
    if (!text) return text;
    return keepDrawable(text, points).replace(/\s+/g, " ").trim() || PLACEHOLDER;
  };
  return satori(clean ? tree : build(drop), { ...size, fonts });
}
