"use client";

/**
 * SyncBridge — invisible client component that keeps a signed-in user's
 * collection mirrored to Supabase.
 *
 *   • On sign-in        → merge the remote collection with the local one
 *   • On collection change → push the local copy up (debounced)
 *
 * Renders nothing; mounted once in the root layout. Entirely inert when
 * Supabase isn't configured or the user is signed out.
 */

import { useEffect } from "react";
import {
  currentUserId,
  onAuthChange,
  pullCollection,
  pushCollection,
  syncConfigured,
} from "@/lib/sync";
import { getCrates, getFavorites, mergeCollections } from "@/lib/collection";

// Persist a pulled-down collection back into the same localStorage the UI
// already reads, then broadcast so every surface refreshes.
function writeLocal(favorites: unknown[], crates: unknown[]) {
  try {
    localStorage.setItem("pulsar_favorites_v1", JSON.stringify(favorites));
    localStorage.setItem("pulsar_crates_v2", JSON.stringify(crates));
    window.dispatchEvent(new CustomEvent("pulsar-collection-change"));
  } catch {
    /* storage full / unavailable */
  }
}

export function SyncBridge() {
  useEffect(() => {
    if (!syncConfigured()) return;
    let userId: string | null = null;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;

    const onChange = () => {
      if (!userId) return; // signed out — nothing to push
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => pushCollection(userId!), 1200); // debounce bursts
    };

    const syncOnSignIn = async (uid: string | null) => {
      userId = uid;
      if (!uid) return;
      // Merge, never overwrite: the remote copy is combined with what's on
      // this device and the union is pushed back up. Overwriting used to wipe
      // every local crate on sign-in (see mergeCollections).
      const remote = await pullCollection(uid);
      if (remote) {
        const merged = mergeCollections(
          { favorites: getFavorites(), crates: getCrates() },
          remote
        );
        writeLocal(merged.favorites, merged.crates);
      }
      await pushCollection(uid);
    };

    // Subscribe to local collection writes (same event the UI dispatches).
    window.addEventListener("pulsar-collection-change", onChange);

    // React to sign-in / sign-out.
    const unsub = onAuthChange((uid) => void syncOnSignIn(uid));

    // Already signed in on a returning session?
    void currentUserId().then((uid) => void syncOnSignIn(uid));

    return () => {
      window.removeEventListener("pulsar-collection-change", onChange);
      unsub();
      if (pushTimer) clearTimeout(pushTimer);
    };
     
  }, []);

  return null;
}

// Re-exported so the auth UI (Sidebar) can read the current collection shape
// when showing a signed-in state without importing collection.ts twice.
export { getCrates, getFavorites };
