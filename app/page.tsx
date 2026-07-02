import { Suspense } from "react";
import { getTodaysReleases, getReleases } from "@/lib/supabase";
import { getLiveFeed } from "@/lib/feed";
import { HeroSection } from "@/components/HeroSection";
import { ReleaseGrid } from "@/components/ReleaseGrid";
import { CATALOG } from "@/lib/catalog";
import type { Release } from "@/lib/types";

export const revalidate = 300; // ISR — revalidate every 5 minutes

const key = (r: Release) => `${r.artist.toLowerCase()}::${r.title.toLowerCase()}`;

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
    getReleases({ limit: 200 }).catch(() => [] as Release[]),
    getLiveFeed().catch(() => [] as Release[]),
  ]);
  return { todaysReleases, dbReleases, liveFeed };
}

export default async function HomePage() {
  const { todaysReleases, dbReleases, liveFeed } = await getPageData();

  // Priority: Supabase releases → live Apple feed → built-in catalog.
  // The site always shows a large, fresh grid — with or without config.
  const gridReleases = mergeReleases(dbReleases, liveFeed, CATALOG);

  // "New today" counts genuine last-24h drops from DB + live feed.
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const freshCount = mergeReleases(todaysReleases, liveFeed).filter(
    (r) => r.release_date === today || r.release_date === yesterday
  ).length;

  const featured = liveFeed[0] ?? todaysReleases[0] ?? gridReleases[0] ?? null;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <HeroSection
        featured={featured}
        totalToday={freshCount}
      />

      {/* Release grid */}
      <section className="pb-24 pt-4">
        <Suspense fallback={<GridSkeleton />}>
          {gridReleases.length > 0 ? (
            <ReleaseGrid releases={gridReleases} />
          ) : (
            <EmptyState />
          )}
        </Suspense>
      </section>

      {/* Footer */}
      <footer className="border-t border-mist/10 py-12 px-6 md:px-12">
        <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-neon-violet animate-pulse" />
            <span className="text-[11px] font-mono text-dust/50 tracking-widest">
              PULSAR — DAILY MUSIC DISCOVERY
            </span>
          </div>
          <p className="text-[10px] font-mono text-dust/30 tracking-widest">
            CURATED BY AI · UPDATED DAILY · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="px-6 md:px-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 md:gap-6">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square rounded-xl bg-mist/20" />
          <div className="mt-3 space-y-2">
            <div className="h-3 bg-mist/20 rounded w-3/4" />
            <div className="h-2.5 bg-mist/10 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-40 text-center px-6">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full border border-mist/20 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-neon-violet/30 animate-pulse-glow" />
        </div>
        <div className="absolute inset-0 rounded-full border border-neon-violet/10 animate-ping" />
      </div>
      <h3 className="text-star-white font-bold text-xl mb-3">
        No releases yet today
      </h3>
      <p className="text-dust text-sm max-w-sm leading-relaxed">
        The agent runs daily at 8:00 UTC. Configure your{" "}
        <span className="text-neon-violet font-mono">.env</span> and run{" "}
        <span className="text-neon-blue font-mono">npm run agent</span> to
        populate with today&apos;s music.
      </p>
    </div>
  );
}
