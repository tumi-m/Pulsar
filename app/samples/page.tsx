import type { Metadata } from "next";
import { getReleases } from "@/lib/supabase";
import { CATALOG } from "@/lib/catalog";
import { SamplesClient } from "@/components/SamplesClient";
import type { Release } from "@/lib/types";

export const metadata: Metadata = {
  title: "PULSAR — Sample DNA",
  description:
    "WhoSampled-style sample breakdowns: what a song samples, what sampled it, covers and remixes — traced through MusicBrainz and the Cover Art Archive.",
  openGraph: {
    title: "PULSAR — Sample DNA",
    description: "Trace any song's sample lineage — what it samples and what sampled it.",
    type: "website",
  },
};

export const revalidate = 300; // ISR — revalidate every 5 minutes

/**
 * Dedicated samples route — the deep-linkable home of the sample graph.
 * /samples?artist=Kanye%20West&title=Stronger opens the breakdown directly.
 */
export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string; title?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const initial =
    sp.artist && sp.title ? { artist: sp.artist, title: sp.title } : null;

  // Releases are used for catalog cross-links + search suggestions only, so a
  // modest slice is plenty (deduped, DB first).
  const db = await getReleases({ limit: 200 }).catch(() => [] as Release[]);
  const byKey = new Map<string, Release>();
  for (const r of [...db, ...CATALOG]) {
    const k = `${r.artist}::${r.title}`.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, r);
  }
  const releases = Array.from(byKey.values());

  return <SamplesClient releases={releases} initial={initial} />;
}