#!/usr/bin/env tsx
/**
 * Pulsar — Grammy winner harvester
 *
 * Grows lib/grammy-artists.ts with Grammy winners (any category) whose award
 * year falls in the last 59 years, from Wikidata's public SPARQL endpoint.
 * No API key required.
 *
 * Results are MERGED into the existing list, never substituted for it: Wikidata's
 * Grammy coverage is uneven, so a run can return fewer names than the curated
 * list already holds. The union only ever grows, so a thin harvest still adds
 * value and a bad one can't destroy anything.
 *
 *   npm run grammy
 *
 * Wikidata models this as: <person/group> wdt:P166 (award received) <award>,
 * The result is written back as a TypeScript module so the app keeps working
 * offline and needs no runtime dependency on Wikidata.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GRAMMY_ARTISTS_UNIQUE } from "../lib/grammy-artists";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Pulsar/1.0 (https://pulsar-ten-sigma.vercel.app; music discovery)";

const SINCE = new Date().getFullYear() - 59;

/**
 * Wikidata models the Grammys inconsistently: the parent award is Q41254, but
 * individual categories ("Grammy Award for Best New Artist" and friends) are
 * linked sometimes by `subclass of` (P279) and sometimes by `part of` (P361).
 * Walking only P279* found barely a hundred winners because it missed most
 * categories entirely — hence traversing BOTH.
 *
 * P166 = award received · Q5 human · Q215380/Q2088357 musical group/ensemble.
 */
const QUERY = `
SELECT DISTINCT ?artistLabel WHERE {
  ?award (wdt:P279*|wdt:P361*) wd:Q41254 .
  ?artist p:P166 ?statement .
  ?statement ps:P166 ?award .
  OPTIONAL { ?statement pq:P585 ?when . }
  FILTER(!BOUND(?when) || YEAR(?when) >= ${SINCE})
  VALUES ?kind { wd:Q5 wd:Q215380 wd:Q2088357 }
  ?artist wdt:P31 ?kind .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;

async function fetchWinners(): Promise<string[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(QUERY)}&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(180_000), // this is a big query; be patient
  });
  if (!res.ok) throw new Error(`Wikidata responded ${res.status}`);
  const data = (await res.json()) as {
    results?: { bindings?: { artistLabel?: { value?: string } }[] };
  };

  const names = new Set<string>();
  for (const row of data.results?.bindings ?? []) {
    const name = row.artistLabel?.value?.trim();
    // Unlabelled entities come back as bare Q-ids — skip those.
    if (!name || /^Q\d+$/.test(name)) continue;
    names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function render(names: string[]): string {
  const body = names.map((n) => `  ${JSON.stringify(n)},`).join("\n");
  return `/**
 * Grammy-winning artists (any category), ${SINCE} → ${new Date().getFullYear()}.
 *
 * GENERATED FILE — do not edit by hand.
 * Regenerate with:  npm run grammy
 * Source: Wikidata (award received → Grammy Award and all category subclasses).
 *
 * ${names.length} winners.
 */

export const GRAMMY_ARTISTS: string[] = [
${body}
];

export const GRAMMY_ARTISTS_UNIQUE: string[] = [
  ...new Set(GRAMMY_ARTISTS.map((n) => n.trim()).filter(Boolean)),
];
`;
}

async function main() {
  console.log(`Querying Wikidata for Grammy winners since ${SINCE}…`);
  const fetched = await fetchWinners();

  // A harvest that returns nothing at all means the query or the endpoint is
  // broken — that is worth failing on. Anything else is useful.
  if (fetched.length === 0) {
    throw new Error("Wikidata returned no winners — query or endpoint is broken.");
  }

  // MERGE rather than replace. Wikidata's Grammy coverage is uneven and a run
  // can legitimately return fewer names than the curated list already holds;
  // treating that as failure (as this script previously did) threw away a
  // perfectly good result and emailed a red build. Union-ing can only ever grow
  // the list, so a partial harvest still contributes and nothing is ever lost.
  const before = new Set(GRAMMY_ARTISTS_UNIQUE);
  const merged = [...new Set([...GRAMMY_ARTISTS_UNIQUE, ...fetched])].sort((a, b) =>
    a.localeCompare(b)
  );
  const added = merged.filter((n) => !before.has(n));

  const out = resolve(process.cwd(), "lib/grammy-artists.ts");
  writeFileSync(out, render(merged), "utf8");
  console.log(
    `✓ Wikidata returned ${fetched.length} · ${added.length} new · ` +
      `${merged.length} total written to lib/grammy-artists.ts`
  );
  if (added.length === 0) console.log("  (nothing new this run — list already current)");
}

main().catch((err) => {
  console.error("✗ Grammy harvest failed:", err instanceof Error ? err.message : err);
  console.error("  The existing seed list is unchanged.");
  process.exit(1);
});
