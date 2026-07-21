import { getTodaysReleases, getReleases } from "@/lib/supabase";
import { getLiveFeed } from "@/lib/feed";
import { HeroSection } from "@/components/HeroSection";
import { ReleaseGrid } from "@/components/ReleaseGrid";
import { CATALOG } from "@/lib/catalog";
import type { Release } from "@/lib/types";

export const revalidate = 300; // ISR — revalidate every 5 minutes

// Normalized dedupe key: ignore "(Remastered)", "[Deluxe]", "- Single",
// punctuation and a leading "the" so the same record never appears twice.
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\s*-\s*(single|ep|deluxe.*|remaster.*|anniversary.*)$/i, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");

const key = (r: Release) => `${norm(r.artist)}::${norm(r.title)}`;

/** Merge sources newest-first, removing duplicates (first occurrence wins). */
function mergeReleases(...sources: Release[][]): Release[] {
  const seen = new Set<string>();
  const out: Release[] = [];
  for (const src of sources) {
    for (const r of src) {
      const k = key(r);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

async function getPageData(): Promise<{
  todaysReleases: Release[];
  liveFeed: Release[];
  dbReleases: Release[];
}> {
  const [todaysReleases, dbReleases, liveFeed] = await Promise.all([
    getTodaysReleases().catch(() => [] as Release[]),
    getReleases({ limit: 300 }).catch(() => [] as Release[]),
    getLiveFeed().catch(() => [] as Release[]),
  ]);
  return { todaysReleases, dbReleases, liveFeed };
}

export default async function HomePage() {
  const { todaysReleases, dbReleases, liveFeed } = await getPageData();

  // Priority: Supabase releases → live feed → built-in catalog.
  // The site always shows a large, fresh grid — with or without config.
  const gridReleases = mergeReleases(dbReleases, liveFeed, CATALOG);

  // "New today" counts genuine last-24h drops from DB + live feed.
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const freshCount = mergeReleases(todaysReleases, liveFeed).filter(
    (r) => r.release_date === today || r.release_date === yesterday
  ).length;

  return (
    <div className="min-h-screen">
      <HeroSection totalReleases={gridReleases.length} totalToday={freshCount} />

      <section className="pb-20">
        <ReleaseGrid releases={gridReleases} />
      </section>

      <footer className="border-t border-star-white/[0.06] px-6 py-10 md:px-10">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-3 md:flex-row">
          <span className="font-mono text-[10px] tracking-[0.22em] text-star-white/35">
            PULSAR — DAILY MUSIC DISCOVERY
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] text-star-white/20">
            UPDATED DAILY · {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
