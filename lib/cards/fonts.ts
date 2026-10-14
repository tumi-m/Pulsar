import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Font } from "satori";
import { CARD_FONT } from "./theme";

/**
 * Fonts for Satori, from the installed @fontsource packages — server only.
 *
 * WOFF, not WOFF2: Satori's font parser reads TTF, OTF and WOFF and nothing
 * else. Each unicode subset is registered under its OWN family name, because
 * Satori uses a single face per name + weight — two subsets both called
 * "Inter" and one of them is simply never consulted — while it does fall back
 * across every registered family, glyph by glyph. So a Cyrillic or Vietnamese
 * title finds its letters without the layout naming every subset.
 *
 * Paths are resolved from process.cwd(), the project root under `next start`,
 * Vercel/Netlify functions, tsx and vitest alike. Output file tracing cannot
 * see a computed path, so next.config.ts lists these files in
 * outputFileTracingIncludes for /api/card — add a weight here, add it there.
 */

const INTER_SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"] as const;
const MONO_SUBSETS = ["latin", "latin-ext", "vietnamese"] as const;

interface FontFile {
  /** Path from the project root. */
  file: string;
  name: string;
  weight: 400 | 700 | 900;
}

const family = (base: string, subset: string) => (subset === "latin" ? base : `${base} ${subset}`);

export const FONT_FILES: readonly FontFile[] = [
  ...INTER_SUBSETS.flatMap((s) =>
    ([700, 900] as const).map((weight) => ({
      file: `node_modules/@fontsource/inter/files/inter-${s}-${weight}-normal.woff`,
      name: family(CARD_FONT.sans, s),
      weight,
    })),
  ),
  ...MONO_SUBSETS.flatMap((s) =>
    ([400, 700] as const).map((weight) => ({
      file: `node_modules/@fontsource/space-mono/files/space-mono-${s}-${weight}-normal.woff`,
      name: family(CARD_FONT.mono, s),
      weight,
    })),
  ),
];

let loading: Promise<Font[]> | null = null;

/**
 * Read every face once per process. The same array is handed to every render
 * on purpose: Satori caches its parsed font engine against the array, which is
 * what takes a warm render from ~100ms down to ~10ms.
 */
export function loadCardFonts(): Promise<Font[]> {
  loading ??= Promise.all(
    FONT_FILES.map(async ({ file, name, weight }) => ({
      name,
      weight,
      style: "normal" as const,
      data: await readFile(path.join(process.cwd(), file)),
    })),
  ).catch((err: unknown) => {
    // A missing file is a deploy problem, not a permanent state: let the next
    // request try again instead of caching the rejection for the process life.
    loading = null;
    throw err;
  });
  return loading;
}
