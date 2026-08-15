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
 * Mirror the entire local collection up to Supabase for `userId`.
 * Replaces the user's remote crates/favorites with the local ones (last
 * writer wins). Called after any collection change while signed in.
 */
export async function pushCollection(userId: string): Promise<void> {
  if (!syncConfigured()) return;
  try {
    // Favorites
    const favs = getFavorites();
    await table("favorites").delete().eq("user_id", userId);
    if (favs.length) {
      await table("favorites").insert(
        favs.map((release) => ({ user_id: userId, release }))
      );
    }

    // Crates + items
    const crates = getCrates();
    await table("crates").delete().eq("user_id", userId);
    for (const crate of crates) {
      const { data } = await table("crates")
        .insert({ user_id: userId, name: crate.name })
        .select("id")
        .single();
      const crateId = (data as { id?: string } | null)?.id;
      if (!crateId || !crate.releases.length) continue;
      await table("crate_items").insert(
        crate.releases.map((release) => ({ crate_id: crateId, release }))
      );
    }
  } catch {
    /* offline / RLS — local copy is authoritative; the next sign-in re-syncs */
  }
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
