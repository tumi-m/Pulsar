#!/usr/bin/env tsx
/**
 * Pulsar — Grammy winner harvester
 *
 * Rewrites lib/grammy-artists.ts with EVERY Grammy winner (any category) whose
 * award year falls in the last 59 years, straight from Wikidata's public SPARQL
 * endpoint. No API key required.
 *
 *   npm run grammy
 *
 * Wikidata models this as: <person/group> wdt:P166 (award received) <award>,
 * where the award is the Grammy Award (Q1011547) or any of its ~100 category
 * subclasses (Best New Artist, Album of the Year, Best Rap Album, …). We match
 * the whole subclass tree so no category is missed, then keep only entities
 * that are humans or musical groups.
 *
 * The result is written back as a TypeScript module so the app keeps working
 * offline and needs no runtime dependency on Wikidata.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Pulsar/1.0 (https://pulsar-ten-sigma.vercel.app; music discovery)";

const SINCE = new Date().getFullYear() - 59;

/**
 * P166  = award received
 * Q1011547 = Grammy Award
 * P279* = subclass-of, transitive → every category award
 * Q5    = human, Q215380 = musical group, Q2088357 = musical ensemble
 */
const QUERY = `
SELECT DISTINCT ?artistLabel WHERE {
  ?award wdt:P279* wd:Q1011547 .
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
  const names = await fetchWinners();
  if (names.length < 200) {
    throw new Error(
      `Only ${names.length} winners returned — refusing to overwrite the seed list with a partial result.`
    );
  }
  const out = resolve(process.cwd(), "lib/grammy-artists.ts");
  writeFileSync(out, render(names), "utf8");
  console.log(`✓ Wrote ${names.length} Grammy winners to lib/grammy-artists.ts`);
}

main().catch((err) => {
  console.error("✗ Grammy harvest failed:", err instanceof Error ? err.message : err);
  console.error("  The existing seed list is unchanged.");
  process.exit(1);
});
