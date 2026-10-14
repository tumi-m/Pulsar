/**
 * npm run motion:cards
 *
 * The asset stage of the motion loop, for stills: renders sample crate share
 * cards and release title cards with Satori (the same renderers /api/card
 * uses), runs each through SVGO with the project's svgo.config.mjs, and writes
 * them to motion/out/cards/. The table it prints is the before/after size of
 * every card, so a layout change that bloats the output is visible here first.
 *
 * Satori embeds every glyph as an outline, so most of a card's bytes are path
 * data; SVGO earns its keep by shortening those coordinates and merging the
 * attributes Satori repeats on every shape.
 *
 * Run from the project root (npm does this): the fonts are read relative to it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, optimize } from "svgo";
import { renderCrateCard, type CrateCardInput } from "../../lib/cards/crate-card";
import { renderTitleCard, type TitleCardInput } from "../../lib/cards/title-card";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "motion/out/cards");

const SAMPLE_RECORDS = [
  { title: "Untrue", artist: "Burial" },
  { title: "Selected Ambient Works 85–92", artist: "Aphex Twin" },
  { title: "Since I Left You", artist: "The Avalanches" },
  { title: "Endtroducing.....", artist: "DJ Shadow" },
  { title: "Music Has the Right to Children", artist: "Boards of Canada" },
  { title: "Группа крови", artist: "Кино" },
  { title: "Mezzanine", artist: "Massive Attack" },
  { title: "Dummy", artist: "Portishead" },
  { title: "Kid A", artist: "Radiohead" },
  { title: "Moon Safari", artist: "Air" },
];

const CRATES: Record<string, CrateCardInput> = {
  // A full card from a crate over the cap: eight tapes, "10 RECORDS · FIRST 8".
  "crate-share": { name: "Late Night Tapes", records: SAMPLE_RECORDS },
  // Two records and a name long enough to wrap and clamp.
  "crate-share-short": {
    name: "Sunday morning coffee and the long walk home through the rain",
    records: SAMPLE_RECORDS.slice(0, 2),
  },
};

const TITLES: Record<string, TitleCardInput> = {
  "title-intro": { title: "Untrue", artist: "Burial", meta: "2007 · Hyperdub · Album", variant: "intro" },
  "title-outro": {
    title: "Music Has the Right to Children",
    artist: "Boards of Canada",
    meta: "1998 · Warp · Album",
    variant: "outro",
  },
};

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const config = await loadConfig("svgo.config.mjs", ROOT);
  if (!config) throw new Error("svgo.config.mjs not found at the project root");
  mkdirSync(OUT, { recursive: true });

  const jobs: [string, () => Promise<string>][] = [
    ...Object.entries(CRATES).map(([name, input]) => [name, () => renderCrateCard(input)] as [string, () => Promise<string>]),
    ...Object.entries(TITLES).map(([name, input]) => [name, () => renderTitleCard(input)] as [string, () => Promise<string>]),
  ];

  const rows: { card: string; before: string; after: string; saved: string }[] = [];
  for (const [name, render] of jobs) {
    const file = path.join(OUT, `${name}.svg`);
    const raw = await render();
    const { data } = optimize(raw, { ...config, path: file });
    writeFileSync(file, data);
    const before = Buffer.byteLength(raw);
    const after = Buffer.byteLength(data);
    rows.push({
      card: path.relative(ROOT, file),
      before: kb(before),
      after: kb(after),
      saved: `${Math.round((1 - after / before) * 100)}%`,
    });
  }
  console.table(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
