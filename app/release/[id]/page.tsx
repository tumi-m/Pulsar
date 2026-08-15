import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getReleases } from "@/lib/supabase";
import { getLiveFeed } from "@/lib/feed";
import { CATALOG } from "@/lib/catalog";
import type { Release } from "@/lib/types";

export const revalidate = 300;

/**
 * Resolve a single release by id across every source: Supabase (the growing
 * archive) → live feed → built-in catalog. The homepage merges these the same
 * way; this route lets any release be linked, shared, and indexed.
 */
async function findRelease(id: string): Promise<Release | null> {
  const byId = (list: Release[]) => list.find((r) => r.id === id) ?? null;
  // DB first (cheapest, indexed), then feed, then catalog.
  try {
    const db = await getReleases({ limit: 500 });
    const hit = byId(db);
    if (hit) return hit;
  } catch {
    /* ignore — try the next source */
  }
  try {
    const feed = await getLiveFeed();
    const hit = byId(feed);
    if (hit) return hit;
  } catch {
    /* ignore */
  }
  return byId(CATALOG);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const r = await findRelease(id);
  if (!r) return { title: "Release — PULSAR" };
  const title = `${r.title} by ${r.artist} — PULSAR`;
  const description =
    r.curator_note ??
    `${r.title} by ${r.artist}${r.genre ? ` · ${r.genre}` : ""}. Listen on PULSAR — daily music discovery.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "music.album",
      images: r.artwork_url ? [{ url: r.artwork_url, width: 1200, height: 1200 }] : [],
      url: `/release/${r.id}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: r.artwork_url ? [r.artwork_url] : [],
    },
  };
}

const DSP_LABEL: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  tidal: "Tidal",
  soundcloud: "SoundCloud",
  youtube_music: "YouTube Music",
};

export default async function ReleasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await findRelease(id);
  if (!r) notFound();

  const links = (["spotify", "apple_music", "tidal", "soundcloud", "youtube_music"] as const)
    .map((k) => ({ key: k, url: r[k] }))
    .filter((l) => l.url) as { key: string; url: string }[];

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 md:py-20">
      <Link
        href="/"
        className="text-[10px] font-bold uppercase tracking-[0.3em] text-star-white/40 transition-colors hover:text-star-white"
      >
        ← PULSAR
      </Link>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
        <img
          src={r.artwork_url ?? ""}
          alt={`${r.title} — ${r.artist}`}
          width={240}
          height={240}
          className="h-48 w-48 flex-shrink-0 rounded-xl object-cover shadow-2xl md:h-60 md:w-60"
        />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-star-white/40">
            {r.type} · {r.release_date}
          </p>
          <h1 className="mt-2 text-3xl font-bold uppercase tracking-tight text-star-white md:text-5xl">
            {r.title}
          </h1>
          <p className="mt-2 text-lg text-star-white/60 md:text-xl">{r.artist}</p>
          {r.genre && (
            <p className="mt-1 text-[12px] uppercase tracking-[0.2em] text-neon-violet/70">{r.genre}</p>
          )}
        </div>
      </div>

      {r.curator_note && (
        <blockquote className="mt-8 border-l-2 border-neon-violet/50 pl-4 text-[15px] leading-relaxed text-star-white/80 md:text-base">
          {r.curator_note}
        </blockquote>
      )}

      {links.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-star-white/35">
            Listen on
          </p>
          <div className="flex flex-wrap gap-2.5">
            {links.map((l) => (
              <a
                key={l.key}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-star-white/20 bg-white/[0.05] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-star-white transition-colors hover:border-star-white/50 hover:bg-white/[0.1]"
              >
                {DSP_LABEL[l.key]}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <Link
          href={`/?play=${encodeURIComponent(r.id)}`}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-blue px-6 py-3 text-[13px] font-bold uppercase tracking-wide text-void transition-transform hover:scale-105"
        >
          Play in PULSAR →
        </Link>
      </div>
    </main>
  );
}