import { createClient } from "@supabase/supabase-js";
import type { Release, AgentRelease } from "./types";

// Lazy clients — read env vars at call time so agent/env.ts config() runs first
let _supabase: ReturnType<typeof createClient> | null = null;

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function getReleases(opts?: {
  limit?: number;
  mood?: string;
  date?: string;
}): Promise<Release[]> {
  let query = supabase
    .from("releases")
    .select("*")
    .order("release_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.mood) query = query.eq("mood", opts.mood);
  if (opts?.date) query = query.eq("release_date", opts.date);
  if (opts?.limit) query = query.limit(opts.limit);

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

export async function saveRelease(
  release: AgentRelease
): Promise<Release> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("releases")
    .upsert(
      {
        artist: release.artist,
        title: release.title,
        type: release.type,
        artwork_url: release.artwork_url,
        release_date: release.release_date,
        genre: release.genre ?? null,
        tags: release.tags ?? [],
        mood: release.mood ?? null,
        spotify: release.spotify,
        apple_music: release.apple_music,
        tidal: release.tidal,
        soundcloud: release.soundcloud,
        youtube_music: release.youtube_music,
        curator_note: release.curator_note ?? null,
      },
      { onConflict: "artist,title" }
    )
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
