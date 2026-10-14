/**
 * Pulsar — card palette.
 *
 * Satori draws outside the app: no Tailwind, no app/globals.css custom
 * properties, so the Walkman palette is restated as literals here. Keep them in
 * step with :root in app/globals.css (the same values remotion/tokens.ts
 * restates for the video). test/cards.test.ts checks the J-card accents against
 * components/Artwork.tsx, which is where a record's stripe colour is decided.
 */

export const CARD_COLOR = {
  deck900: "#0b0d10",
  deck800: "#12161a",
  deck700: "#1a2027",
  deck600: "#252d36",
  chrome700: "#59626b",
  ink: "#edf1f4",
  ink400: "#98a2ab",
  ink600: "#626b74",
  sony: "#f2662c",
  tps: "#4e86c7",
  sport: "#ffce0a",
  vu: "#e23b2e",
  lcd: "#7ed9ae",
  /** The dark glass an LCD readout sits behind. */
  lcdWell: "#0c1712",
  creamTop: "#f2e9d3",
  creamBottom: "#e3d5b4",
  tape: "#3a2a20",
  /** Ink written on a cream J-card. */
  labelInk: "#12161a",
  labelInkSoft: "rgba(18, 22, 26, 0.62)",
  /** The faint blue rules a J-card gives you to write the tracklist on. */
  rule: "rgba(78, 134, 199, 0.24)",
} as const;

/** Same five, same order, as JCARD_ACCENTS in components/Artwork.tsx. */
export const CARD_ACCENTS = [
  CARD_COLOR.sony,
  CARD_COLOR.tps,
  CARD_COLOR.sport,
  CARD_COLOR.lcd,
  CARD_COLOR.vu,
] as const;

/**
 * The stripe a record gets in the app (Artwork's jcardAccent, seeded by the
 * lower-cased artist), so a tape on the card is the colour it is in the crate.
 * Not imported from there: that module is a client component that pulls in
 * next/image, which a route handler and the tsx build script can't use.
 */
export function cardAccent(artist: string): string {
  const seed = artist.toLowerCase();
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CARD_ACCENTS[h % CARD_ACCENTS.length];
}

/** Font family names registered with Satori by lib/cards/fonts.ts. */
export const CARD_FONT = { sans: "Inter", mono: "Space Mono" } as const;
