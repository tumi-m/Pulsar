"use client";

/**
 * Pulsar — Collection Sync
 *
 * Cross-device mirror of the localStorage collection (crates + favorites).
 *
 * Design: localStorage remains the OFFLINE-FIRST source of truth — the UI
 * reads/writes it exactly as before (lib/collection.ts). When a user is
 * signed in, this module mirrors every change up to Supabase and pulls the
 * remote copy down on sign-in, so the collection follows them across devices.
 * Nothing breaks when signed out or offline; the next sign-in re-syncs.
 *
 * Auth is Supabase magic-link (email) — no password, no OAuth app to
 * configure. A user only ever sees their own rows (RLS in schema.sql).
 */

import { supabase } from "./supabase";
import type { Release } from "./types";
import { getCrates, getFavorites } from "./collection";

/** Is the sync layer configured (Supabase present + auth available)? */
export function syncConfigured(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Currently signed-in user id, or null. */
export async function currentUserId(): Promise<string | null> {
  if (!syncConfigured()) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Send a magic-link email. Returns true if the request was accepted. */
export async function signInWithEmail(email: string): Promise<boolean> {
  if (!syncConfigured()) return false;
  try {
    const redirectTo =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    return !error;
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  if (!syncConfigured()) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* noop */
  }
}

/** Listen for auth state changes; returns an unsubscribe fn. */
export function onAuthChange(fn: (userId: string | null) => void): () => void {
  if (!syncConfigured()) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    fn(session?.user?.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

// ── Push: local → Supabase ─────────────────────────────────────────

/**
 * The client-side `supabase` proxy carries no generated Database generic, so
 * `.from("favorites").insert(...)` resolves to a `never` payload. The table
 * shapes are defined by schema.sql, not codegen, so we cast the builder once
 * here rather than fight phantom types. (Server-side saves go through
 * supabaseAdmin() which compiles cleanly.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => supabase.from(name) as any;

/**
 * Mirror the local collection up to Supabase for `userId`.
 *
 * MERGE, never replace: remote rows are upserted on the existing unique
 * constraints (crates.name per user, favorites/crate_items per release id),
 * and local-only deletions are reconciled explicitly by id list. A crashed
 * push can never wipe the remote collection the way delete-all+reinsert
 * could — every step is additive or an exact keyed delete.
 */
export async function pushCollection(userId: string): Promise<void> {
  if (!syncConfigured()) return;
  try {
    // ── Favorites ────────────────────────────────────────────────
    const favs = getFavorites();
    const favIds = favs.map((r) => r.id);
    // Remote rows not present locally were removed on this device → delete.
    const { data: remoteFavIds } = await table("favorites")
      .select("release->>'id' as rid")
      .eq("user_id", userId);
    const localFavSet = new Set(favIds);
    const staleFavs = (remoteFavIds ?? [])
      .map((r: { rid?: string }) => r.rid)
      .filter((id?: string) => id && !localFavSet.has(id));
    if (staleFavs.length) {
      await table("favorites")
        .delete()
        .eq("user_id", userId)
        .in("release->>'id'", staleFavs);
    }
    for (const chunk of chunked(favs, 500)) {
      const { error } = await table("favorites").upsert(
        chunk.map((release) => ({ user_id: userId, release })),
        { onConflict: "user_id,release->>'id'", ignoreDuplicates: false }
      );
      if (error) console.warn("[sync] favorites upsert:", error.message);
    }

    // ── Crates ───────────────────────────────────────────────────
    const crates = getCrates();
    const { data: remoteCrates } = await table("crates")
      .select("id, name")
      .eq("user_id", userId);
    const remoteCrateRows = (remoteCrates ?? []) as { id: string; name: string }[];

    // Upsert crate metadata keyed by (user_id, name). Local crate ids are
    // client-generated, so reuse the remote id when the name matches — that
    // keeps crate_items linked across devices.
    const remoteByName = new Map(remoteCrateRows.map((c) => [c.name, c]));
    const crateIdFor = new Map<string, string>();
    for (const c of crates) {
      const remote = remoteByName.get(c.name);
      const id = remote?.id ?? c.id;
      crateIdFor.set(c.id, id);
    }
    const staleCrates = remoteCrateRows.filter((c) => {
      // Remote crate whose name no longer exists locally (renamed/deleted).
      return !crates.some((c2) => crateIdFor.get(c2.id) === c.id);
    });
    if (staleCrates.length) {
      await table("crates")
        .delete()
        .in("id", staleCrates.map((c) => c.id))
        .eq("user_id", userId);
    }
    for (const chunk of chunked(crates, 100)) {
      const { error } = await table("crates").upsert(
        chunk.map((c) => ({
          id: crateIdFor.get(c.id) ?? c.id,
          user_id: userId,
          name: c.name,
        })),
        { onConflict: "id" }
      );
      if (error) console.warn("[sync] crates upsert:", error.message);
    }

    // ── Crate items ──────────────────────────────────────────────
    for (const c of crates) {
      const crateId = crateIdFor.get(c.id) ?? c.id;
      const { data: remoteItems } = await table("crate_items")
        .select("release->>'id' as rid")
        .eq("crate_id", crateId);
      const localSet = new Set(c.releases.map((r) => r.id));
      const staleItems = (remoteItems ?? [])
        .map((r: { rid?: string }) => r.rid)
        .filter((id?: string) => id && !localSet.has(id));
      if (staleItems.length) {
        await table("crate_items")
          .delete()
          .eq("crate_id", crateId)
          .in("release->>'id'", staleItems);
      }
      for (const chunk of chunked(c.releases, 500)) {
        const { error } = await table("crate_items").upsert(
          chunk.map((release) => ({ crate_id: crateId, release })),
          { onConflict: "crate_id,release->>'id'" }
        );
        if (error) console.warn("[sync] crate_items upsert:", error.message);
      }
    }
  } catch (err) {
    console.warn(
      "[sync] push failed (offline/RLS) — local copy stays authoritative:",
      err instanceof Error ? err.message : err
    );
  }
}

/** Split a list into fixed-size batches (Supabase payload safety). */
function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Pull: Supabase → local ─────────────────────────────────────────

interface RemoteCrateRow {
  id: string;
  name: string;
}

/**
 * Fetch the remote collection for `userId`. Returns null when the user has
 * nothing stored remotely (so the caller keeps the local copy untouched).
 */
export async function pullCollection(userId: string): Promise<{
  favorites: Release[];
  crates: { id: string; name: string; releases: Release[] }[];
} | null> {
  if (!syncConfigured()) return null;
  try {
    const { data: favRows } = await supabase
      .from("favorites")
      .select("release")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });
    const favorites = (favRows ?? []).map((r) => (r as { release: Release }).release);

    const { data: crateRows } = await supabase
      .from("crates")
      .select("id, name")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const cratesMeta = (crateRows as RemoteCrateRow[] | null) ?? [];
    if (!favRows?.length && !cratesMeta.length) return null;

    const crates = [];
    for (const c of cratesMeta) {
      const { data: items } = await supabase
        .from("crate_items")
        .select("release")
        .eq("crate_id", c.id)
        .order("added_at", { ascending: false });
      crates.push({
        id: c.id,
        name: c.name,
        releases: (items ?? []).map((i) => (i as { release: Release }).release),
      });
    }
    return { favorites, crates };
  } catch {
    return null;
  }
}

/** Record a listen for the taste/daily-mix history (best-effort). */
export async function recordListen(userId: string, release: Release): Promise<void> {
  if (!syncConfigured()) return;
  try {
    await table("listen_history").insert({ user_id: userId, release });
  } catch {
    /* non-fatal */
  }
}
