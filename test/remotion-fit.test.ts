import { describe, expect, it } from "vitest";
import {
  ARTIST_FACE,
  ARTIST_SIZES,
  fitArtist,
  fitTitle,
  lineCount,
  LABEL_TEXT_WIDTH,
  textWidthEm,
  TITLE_FACE,
  TITLE_LINE_HEIGHT,
  TITLE_STEPS,
  truncateToFit,
} from "@/remotion/fit";
import { TITLE_MAX } from "@/remotion/props";
import { CARD_WIDTH } from "@/remotion/tokens";

const ZIGGY = "The Rise and Fall of Ziggy Stardust and the Spiders from Mars";

describe("text width", () => {
  it("measures uppercase Inter Black from the font's advances", () => {
    // M is 956/1000 em, I 291 — lowercase is drawn uppercase, so measured as such.
    expect(textWidthEm("M", { weight: 900, letterSpacingEm: 0 })).toBeCloseTo(0.956);
    expect(textWidthEm("i", { weight: 900, letterSpacingEm: 0 })).toBeCloseTo(0.291);
    expect(textWidthEm("MI", { weight: 900, letterSpacingEm: 0.1 })).toBeCloseTo(0.956 + 0.291 + 0.2);
  });

  it("gives accented capitals their base letter's width and unknown scripts a wide one", () => {
    const face = { weight: 900, letterSpacingEm: 0 } as const;
    expect(textWidthEm("É", face)).toBe(textWidthEm("E", face));
    expect(textWidthEm("ágætis", face)).toBe(textWidthEm("AGÆTIS", face));
    expect(textWidthEm("東", face)).toBe(1);
    expect(textWidthEm("Ж", face)).toBeGreaterThan(textWidthEm("E", face));
  });
});

describe("lineCount", () => {
  const face = { weight: 900, letterSpacingEm: 0 } as const;
  it("wraps greedily at spaces", () => {
    const w = textWidthEm("AAA AAA", face) * 10;
    expect(lineCount("AAA AAA", 10, w, face)).toBe(1);
    expect(lineCount("AAA AAA", 10, w - 1, face)).toBe(2);
    expect(lineCount("", 10, 100, face)).toBe(0);
  });

  it("breaks a word too long for any line by characters", () => {
    const one = textWidthEm("W", face) * 10;
    expect(lineCount("WWWW", 10, one * 2 + 0.5, face)).toBe(2);
    expect(lineCount("A WWWW", 10, one * 2 + 0.5, face)).toBe(3);
  });
});

describe("fitTitle", () => {
  it("keeps the old sizes for titles that already fit", () => {
    expect(fitTitle("GNX")).toEqual({ text: "GNX", fontSize: 104, maxLines: 1 });
    expect(fitTitle("Melodrama").fontSize).toBe(104);
    expect(fitTitle("Mr. Morale & the Big Steppers")).toMatchObject({ text: "Mr. Morale & the Big Steppers", fontSize: 72 });
  });

  it("shows all of Ziggy Stardust — the title the two-line cap silently cut", () => {
    const fit = fitTitle(ZIGGY);
    expect(fit.text).toBe(ZIGGY);
    expect(fit.fontSize).toBe(52);
    expect(lineCount(fit.text, fit.fontSize, LABEL_TEXT_WIDTH, TITLE_FACE)).toBeLessThanOrEqual(fit.maxLines);
  });

  it("cuts what still doesn't fit at a word, and says so with an ellipsis", () => {
    const long = "When the Pawn Hits the Conflicts He Thinks Like a King What He Knows Throws the Blows When He Goes to the Fight";
    const fit = fitTitle(long);
    expect(fit.text.endsWith("…")).toBe(true);
    expect(long.startsWith(fit.text.slice(0, -1))).toBe(true);
    expect(long[fit.text.length - 1]).toBe(" "); // cut between words
    expect(lineCount(fit.text, fit.fontSize, LABEL_TEXT_WIDTH, TITLE_FACE)).toBeLessThanOrEqual(fit.maxLines);
  });

  it("never lays out more lines than its step allows, for any title up to the data cap", () => {
    const words = ["LOVE", "WWWWWW", "I", "MMMMMMMMMMMMMMMMMMMMMMMMMMMMM", "the", "Ágætis", "&", "2001"];
    for (let seed = 1; seed <= 300; seed++) {
      let t = "";
      let x = seed;
      while (t.length < (seed % TITLE_MAX) + 1) {
        x = (x * 1103515245 + 12345) % 2147483648;
        t += (t ? " " : "") + words[x % words.length];
      }
      const fit = fitTitle(t);
      expect(TITLE_STEPS).toContainEqual({ fontSize: fit.fontSize, maxLines: fit.maxLines });
      expect(lineCount(fit.text, fit.fontSize, LABEL_TEXT_WIDTH, TITLE_FACE)).toBeLessThanOrEqual(fit.maxLines);
      if (fit.text !== t) expect(fit.text.endsWith("…")).toBe(true);
    }
  });

  it("only ever picks a block that fits the card's layout budget (two lines of 88px)", () => {
    const budget = 88 * TITLE_LINE_HEIGHT * 2;
    for (const step of TITLE_STEPS) expect(step.fontSize * TITLE_LINE_HEIGHT * step.maxLines).toBeLessThanOrEqual(budget);
    // sizes only go down
    for (let i = 1; i < TITLE_STEPS.length; i++) expect(TITLE_STEPS[i].fontSize).toBeLessThan(TITLE_STEPS[i - 1].fontSize);
    expect(LABEL_TEXT_WIDTH).toBe(CARD_WIDTH - 88);
  });
});

describe("fitArtist", () => {
  it("keeps short names at full size", () => {
    expect(fitArtist("Kendrick Lamar")).toEqual({ text: "Kendrick Lamar", fontSize: ARTIST_SIZES[0] });
  });

  it("steps a long name down a size before cutting it", () => {
    const fit = fitArtist("Tom Petty and the Heartbreakers");
    expect(fit.text).toBe("Tom Petty and the Heartbreakers");
    expect(fit.fontSize).toBeLessThan(ARTIST_SIZES[0]);
  });

  it("cuts a name too long even at the smallest size, with an ellipsis, on one line", () => {
    const fit = fitArtist("Wolfgang Amadeus Mozart & the Berlin Philharmonic Orchestra");
    expect(fit.fontSize).toBe(ARTIST_SIZES[ARTIST_SIZES.length - 1]);
    expect(fit.text.endsWith("…")).toBe(true);
    expect(textWidthEm(fit.text, ARTIST_FACE) * fit.fontSize).toBeLessThanOrEqual(LABEL_TEXT_WIDTH);
  });
});

describe("truncateToFit", () => {
  const under = (n: number) => (s: string) => s.length <= n;
  it("cuts between words and drops a dangling '&' or comma", () => {
    expect(truncateToFit("Simon & Garfunkel Greatest", under(10))).toBe("Simon…");
    expect(truncateToFit("Live, Loud and Late", under(8))).toBe("Live…");
  });
  it("cuts inside a word only when a word cut would lose most of the text", () => {
    expect(truncateToFit("A Supercalifragilistic", under(12))).toBe("A Supercali…");
  });
  it("does not stack a second ellipsis on one clip() already added", () => {
    expect(truncateToFit("Something long…", under(10))).toBe("Something…");
  });
});
