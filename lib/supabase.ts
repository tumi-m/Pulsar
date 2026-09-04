import { createClient } from "@supabase/supabase-js";
import type { Release, AgentRelease } from "./types";

// Chainable no-op stub for build-time static generation (no env vars available)
const resolved = Promise.resolve({ data: [], error: null, count: 0 });
const buildTimeStub: unknown = new Proxy(resolved, {
  get(target, prop) {
    if (prop === "then") {
      return (target as Promise<unknown>).then.bind(target);
    }
    if (prop === "catch") {
      return (target as Promise<unknown>).catch.bind(target);
    }
    if (prop === "finally") {
      return (target as Promise<unknown>).finally.bind(target);
    }
    return () => buildTimeStub;
  },
});

/**
 * Sanitize the project URL down to its bare origin.
 *
 * supabase-js appends "/rest/v1/…" itself, so anything pasted beyond the origin
 * breaks every request. Two very easy mistakes to make when copying out of the
 * Supabase dashboard:
 *   • a trailing slash        → "//rest/v1/…"  ("Invalid path specified")
 *   • the full REST endpoint  → "/rest/v1/rest/v1/releases" (404 on every write)
 * Both are silently corrected here rather than failing at runtime.
 */
export const cleanUrl = () => {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin; // drops any path, query and trailing slash
  } catch {
    // Not a parseable URL — fall back to trimming the obvious mistakes.
    return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  }
};

// Lazy client — reads env vars at call time so agent/env.ts config() has already run
let _supabase: ReturnType<typeof createClient> | null = null;

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return () => buildTimeStub;
    }
    if (!_supabase) {
      _supabase = createClient(cleanUrl(), (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim());
    }
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const supabaseAdmin = () =>
  createClient(cleanUrl(), (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(), {
    auth: { persistSession: false },
  });

export const MAX_RELEASES_LIMIT = 100;
export const MAX_SEARCH_LIMIT = 60;

function clampLimit(value: number | undefined, max: number): number | undefined {
  if (value == null) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(Math.floor(value), max);
}

export async function getReleases(opts?: {
  limit?: number;
  mood?: string;
  date?: string;
}): Promise<Release[]> {
  const limit = clampLimit(opts?.limit, MAX_RELEASES_LIMIT);
  const mood = opts?.mood?.trim().slice(0, 64) || undefined;
  const date = opts?.date?.trim().slice(0, 32) || undefined;
  let query = supabase
    .from("releases")
    .select("*")
    .order("release_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (mood) query = query.eq("mood", mood);
  if (date) query = query.eq("release_date", date);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch releases: ${error.message}`);
  return (data as Release[]) ?? [];
}

export async function getTodaysReleases(): Promise<Release[]> {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("releases")
    .select("*")
    .in("release_date", [today, yesterday])
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch today's releases: ${error.message}`);
  return (data as Release[]) ?? [];
}


/**
 * Build the upsert payload for a release.
 *
 * The subtlety is what is DELIBERATELY OMITTED. PostgREST's upsert only writes
 * the columns present in the payload — `ON CONFLICT DO UPDATE SET col =
 * EXCLUDED.col` for those columns and no others — so leaving a key out means
 * "keep whatever is already stored".
 *
 * That matters because the ingest pipeline enriches only ENRICH_LIMIT releases
 * per run and then saves ALL of them. Writing `curator_note: null` and
 * `tags: []` for the unenriched majority wiped the curator notes and sonic
 * descriptors of every release enriched on a previous run — so enrichment
 * could never accumulate, and the descriptors the Selector now matches against
 * would be erased nightly for everything outside the newest slice.
 *
 * Enrichment fields are therefore written only when they carry something.
 * Factual fields (artwork, links, dates) are always written, because a fresh
 * value from the feed should win.
 */
export function upsertPayload(release: AgentRelease): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    artist: release.artist,
    title: release.title,
    type: release.type,
    artwork_url: release.artwork_url,
    release_date: release.release_date,
    genre: release.genre ?? null,
    spotify: release.spotify,
    apple_music: release.apple_music,
    tidal: release.tidal,
    soundcloud: release.soundcloud,
    youtube_music: release.youtube_music,
    boomplay: release.boomplay ?? null,
  };
  // Only overwrite enrichment when this run actually produced some.
  if (release.tags && release.tags.length > 0) payload.tags = release.tags;
  if (release.mood) payload.mood = release.mood;
  if (release.curator_note) payload.curator_note = release.curator_note;
  return payload;
}

export async function saveRelease(
  release: AgentRelease
): Promise<Release> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("releases")
    .upsert(upsertPayload(release), { onConflict: "artist,title" })
    .select()
    .single();

  if (error) throw new Error(`Failed to save release: ${error.message}`);
  return data as Release;
}

export async function releaseExists(artist: string, title: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { count, error } = await db
    .from("releases")
    .select("id", { count: "exact", head: true })
    .ilike("artist", artist)
    .ilike("title", title);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Server-side search over the WHOLE Supabase archive (which grows daily and
 * can far exceed the 2000-release payload the homepage ships to the client).
 * Matches artist, title, genre or label — case-insensitive substring. Used by
 * /api/search so a query reaches beyond what's currently rendered.
 */
export async function searchReleases(q: string, limit = 60): Promise<Release[]> {
  const term = q.trim().slice(0, 120);
  if (!term) return [];
  // Supabase `.or()` with ilike patterns. Escape the pattern metacharacters a
  // user could type so a stray % or _ doesn't turn into a wildcard match-all.
  const esc = term.replace(/([%_\\])/g, "\\$1");
  if (!esc) return [];
  const safeLimit = clampLimit(limit, MAX_SEARCH_LIMIT) ?? MAX_SEARCH_LIMIT;
  const { data, error } = await supabase
    .from("releases")
    .select("*")
    .or(`artist.ilike.%${esc}%,title.ilike.%${esc}%,genre.ilike.%${esc}%`)
    .order("release_date", { ascending: false })
    .limit(safeLimit);
  if (error) return [];
  return (data as Release[]) ?? [];
}
