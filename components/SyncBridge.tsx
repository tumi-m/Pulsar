"use client";

/**
 * SyncBridge — invisible client component that keeps a signed-in user's
 * collection mirrored to Supabase.
 *
 *   • On sign-in        → pull the remote collection down over localStorage
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
import { getCrates, getFavorites } from "@/lib/collection";

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
      // Pull the remote copy; if they have one, it becomes local truth.
      const remote = await pullCollection(uid);
      if (remote) writeLocal(remote.favorites, remote.crates);
      else await pushCollection(uid); // first sign-in: upload the local library
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Re-exported so the auth UI (Sidebar) can read the current collection shape
// when showing a signed-in state without importing collection.ts twice.
export { getCrates, getFavorites };
