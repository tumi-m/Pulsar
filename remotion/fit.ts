/**
 * Fitting card text to the J-card by what will actually fit on it.
 *
 * A character cap alone was the wrong measure: "The Rise and Fall of Ziggy
 * Stardust and the Spiders from Mars" is under the 64-character data bound but
 * three lines at the smallest size, so the label's overflow:hidden quietly
 * dropped "SPIDERS FROM MARS" with nothing to show text was missing. Text is
 * now laid out ahead of time — glyph advances, greedy word wrap — and what
 * still doesn't fit is cut at a word and ends on an ellipsis.
 *
 * Why a table instead of measuring: the CLI, the Player and the web renderer
 * all lay text out in their own document, and the CLI bundle may not have the
 * fonts registered when this runs, so measuring a live node would be measuring
 * the wrong thing. Inter's advances are fixed by the font file; these are its
 * uppercase advances (cards are textTransform: uppercase) in thousandths of an
 * em, measured from the @fontsource woff2 files remotion/fonts.ts registers —
 * the same outlines next/font serves the app. Kerning only ever tightens
 * uppercase Inter (by ~1% on a typical title), so the sum of advances is a
 * slight overestimate, which is the safe side to be wrong on.
 */

const GLYPHS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`{|}~ÆÐØÞŒ…’‘“”–—·•€×¡¿«»";
// prettier-ignore
const ADVANCE_900 = [199, 381, 625, 662, 666, 1044, 695, 372, 388, 388, 608, 693, 373, 475, 373, 412, 711, 452, 646, 669, 702, 646, 675, 595, 679, 675, 373, 378, 693, 693, 693, 601, 1059, 795, 668, 748, 723, 613, 584, 754, 750, 291, 596, 759, 565, 956, 770, 775, 656, 787, 668, 666, 687, 722, 795, 1082, 786, 775, 694, 388, 412, 388, 500, 493, 401, 505, 405, 505, 693, 1047, 781, 775, 697, 1029, 1119, 353, 353, 625, 610, 500, 1000, 373, 398, 700, 693, 381, 601, 726, 726];
// prettier-ignore
const ADVANCE_700 = [237, 338, 552, 649, 655, 1016, 672, 339, 377, 377, 559, 679, 334, 468, 334, 388, 674, 431, 630, 646, 676, 622, 649, 582, 651, 649, 334, 343, 679, 679, 679, 560, 1016, 747, 662, 740, 722, 607, 587, 750, 747, 281, 584, 719, 565, 932, 762, 771, 648, 777, 657, 655, 667, 732, 747, 1038, 738, 731, 664, 377, 388, 377, 487, 476, 365, 469, 372, 469, 679, 1022, 760, 771, 669, 1018, 1002, 311, 311, 540, 532, 500, 1000, 334, 474, 685, 679, 338, 560, 660, 660];

function table(advances: readonly number[]): Map<string, number> {
  const m = new Map<string, number>();
  [...GLYPHS].forEach((ch, i) => m.set(ch, advances[i] / 1000));
  return m;
}

const TABLES = { 900: table(ADVANCE_900), 700: table(ADVANCE_700) } as const;

/** CJK, kana, Hangul and full-width forms are a full em in any font that has them. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
/** Anything else unknown (Greek, Cyrillic, symbols, emoji): wider than all but M and W. */
const UNKNOWN_EM = 0.85;

export type Face = { weight: 700 | 900; letterSpacingEm: number };

function charEm(ch: string, glyphs: Map<string, number>): number {
  const known = glyphs.get(ch);
  if (known !== undefined) return known;
  // É → E + ◌́: accented capitals keep their base letter's advance.
  const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
  if (base === "") return 0;
  if (base !== ch && base.length === 1 && glyphs.has(base)) return glyphs.get(base)!;
  return WIDE.test(ch) ? 1 : UNKNOWN_EM;
}

/** Width of `text` as drawn uppercase in `face`, in ems (letter-spacing included). */
export function textWidthEm(text: string, face: Face): number {
  const glyphs = TABLES[face.weight];
  let em = 0;
  for (const ch of text.toUpperCase()) em += charEm(ch, glyphs) + face.letterSpacingEm;
  return em;
}

/**
 * How many lines `text` wraps to in a box `width` px wide — the browser's
 * greedy fill, breaking at spaces, and mid-word only for a word too long for a
 * line on its own (the title's overflow-wrap: anywhere). Breaking only at
 * spaces where a browser may also break after a hyphen errs towards more lines.
 */
export function lineCount(text: string, fontSize: number, width: number, face: Face): number {
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0) return 0;
  const space = textWidthEm(" ", face) * fontSize;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const w = textWidthEm(word, face) * fontSize;
    if (used === 0 && w <= width) {
      used = w;
    } else if (used > 0 && used + space + w <= width) {
      used += space + w;
    } else if (w <= width) {
      lines++;
      used = w;
    } else {
      // Too long for any line: it starts a fresh one and is cut by characters.
      if (used > 0) lines++;
      used = 0;
      for (const ch of word) {
        const c = textWidthEm(ch, face) * fontSize;
        if (used > 0 && used + c > width) {
          lines++;
          used = 0;
        }
        used += c;
      }
    }
  }
  return lines;
}

/**
 * The longest start of `text` that `fits`, ending on an ellipsis. Cut between
 * words when that keeps most of what a cut mid-word would, and never leave a
 * dangling "&" or comma in front of the ellipsis.
 */
export function truncateToFit(text: string, fits: (candidate: string) => boolean): string {
  const base = text.replace(/…$/, "").trimEnd();
  const finish = (s: string) => `${s.replace(/[\s,;:&+/·–—-]+$/u, "")}…`;
  const chars = [...base];
  let byChar = "";
  for (let n = chars.length - 1; n >= 1; n--) {
    const candidate = finish(chars.slice(0, n).join(""));
    if (candidate !== "…" && fits(candidate)) {
      byChar = candidate;
      break;
    }
  }
  const words = base.split(" ");
  for (let n = words.length - 1; n >= 1; n--) {
    const candidate = finish(words.slice(0, n).join(" "));
    if (candidate === "…" || !fits(candidate)) continue;
    // "SOMETHING…" beats "SOMETHING VERYLONGWO…", but not "S…" over "SOMETHING VERYLONGWO…".
    return candidate.length >= byChar.length * 0.6 ? candidate : byChar;
  }
  return byChar || "…";
}

/* ── the J-card's two lines of type ─────────────────────────────── */

/** The J-card's text column: the 820px card less 44px of padding a side. */
export const LABEL_TEXT_WIDTH = 820 - 2 * 44;
/**
 * Headroom for what a table can't see — sub-pixel layout, a renderer that
 * rounds differently. Kerning already leaves ~1% in hand, and with every
 * width overestimated greedy wrapping can only find as many lines as the
 * browser or more, so a little is enough; too much only costs a borderline
 * title a size step.
 */
const SAFETY = 0.98;

export const TITLE_FACE: Face = { weight: 900, letterSpacingEm: 0.005 };
export const TITLE_LINE_HEIGHT = 1.02;
/**
 * Title sizes, largest first. 104px only for a title that fits on one line;
 * the smallest size gets a third line because three lines of 52px are still
 * shorter than two of 88px, the block the card layout is budgeted for (see
 * CARD_TOP in tokens.ts).
 */
export const TITLE_STEPS: readonly { fontSize: number; maxLines: number }[] = [
  { fontSize: 104, maxLines: 1 },
  { fontSize: 88, maxLines: 2 },
  { fontSize: 72, maxLines: 2 },
  { fontSize: 60, maxLines: 2 },
  { fontSize: 52, maxLines: 3 },
];

export type FittedTitle = { text: string; fontSize: number; maxLines: number };

export function fitTitle(title: string, width: number = LABEL_TEXT_WIDTH): FittedTitle {
  const room = width * SAFETY;
  for (const step of TITLE_STEPS) {
    if (lineCount(title, step.fontSize, room, TITLE_FACE) <= step.maxLines) return { text: title, ...step };
  }
  const last = TITLE_STEPS[TITLE_STEPS.length - 1];
  const text = truncateToFit(title, (t) => lineCount(t, last.fontSize, room, TITLE_FACE) <= last.maxLines);
  return { text, ...last };
}

export const ARTIST_FACE: Face = { weight: 700, letterSpacingEm: 0.1 };
/** One line under the title; a long name steps down before it is cut. */
export const ARTIST_SIZES = [44, 38, 32, 28] as const;

export type FittedArtist = { text: string; fontSize: number };

export function fitArtist(artist: string, width: number = LABEL_TEXT_WIDTH): FittedArtist {
  const room = width * SAFETY;
  const fits = (text: string, size: number) => textWidthEm(text, ARTIST_FACE) * size <= room;
  for (const fontSize of ARTIST_SIZES) {
    if (fits(artist, fontSize)) return { text: artist, fontSize };
  }
  const smallest = ARTIST_SIZES[ARTIST_SIZES.length - 1];
  return { text: truncateToFit(artist, (t) => fits(t, smallest)), fontSize: smallest };
}
