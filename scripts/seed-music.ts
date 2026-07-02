#!/usr/bin/env tsx
/**
 * Pulsar — Music Seed Script
 * Populates the database with the built-in catalog (lib/catalog.ts):
 *   • Rolling Stone Top 500 Albums (selected)
 *   • Classic Stoner / Psychedelic albums
 *   • Grammy winners (recent years, major categories)
 *
 * Run: npm run seed
 */

import { createClient } from "@supabase/supabase-js";
import { CATALOG_DATA } from "../lib/catalog";
import { config } from "../agent/env";

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function seed() {
  console.log(`\n🎵 Pulsar Seed Script`);
  console.log(`   Seeding ${CATALOG_DATA.length} releases...\n`);

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (const release of CATALOG_DATA) {
    const { data: existing } = await supabase
      .from("releases")
      .select("id")
      .ilike("artist", release.artist)
      .ilike("title", release.title)
      .single();

    if (existing) {
      console.log(`  ⏭  Already exists: ${release.artist} — ${release.title}`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("releases").insert(release);

    if (error) {
      console.error(`  ❌ Error saving ${release.artist} — ${release.title}: ${error.message}`);
      errors++;
    } else {
      console.log(`  ✓  Saved: ${release.artist} — ${release.title}`);
      saved++;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ Seed complete`);
  console.log(`   Saved:   ${saved}`);
  console.log(`   Skipped: ${skipped} (already existed)`);
  console.log(`   Errors:  ${errors}`);
  console.log(`${"─".repeat(50)}\n`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
