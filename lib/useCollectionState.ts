"use client";

import { useEffect, useState } from "react";
import { isFavorite, inPlaylist } from "./collection";

/**
 * Shared favourite/crate membership for grid tiles.
 *
 * Every ReleaseCard used to register its own `pulsar-collection-change`
 * listener and re-read localStorage on every change. With a few hundred tiles
 * on screen that's a few hundred listeners, and a single favourite tap woke all
 * of them — each parsing the collection JSON again.
 *
 * This keeps ONE window listener for the whole app. On a change it reads
 * localStorage once, then notifies subscribers, so the cost is O(1) parses
 * instead of O(tiles).
 */

type Snapshot = { favs: Set<string>; crated: Set<string> };

let snapshot: Snapshot = { favs: new Set(), crated: new Set() };
let listening = false;
let loaded = false;
const subscribers = new Set<() => void>();

/**
 * Rebuild the membership sets. `isFavorite`/`inPlaylist` each read storage, so
 * we can't enumerate cheaply — instead we track which ids have been asked about
 * and refresh only those, which is exactly the set of mounted tiles.
 */
const tracked = new Set<string>();

function refresh() {
  const favs = new Set<string>();
  const crated = new Set<string>();
  for (const id of tracked) {
    if (isFavorite(id)) favs.add(id);
    if (inPlaylist(id)) crated.add(id);
  }
  snapshot = { favs, crated };
  loaded = true;
  subscribers.forEach((fn) => fn());
}

function ensureListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pulsar-collection-change", refresh);
}

export function useCollectionState(id: string): { fav: boolean; inList: boolean } {
  const [, force] = useState(0);

  useEffect(() => {
    ensureListening();
    const isNew = !tracked.has(id);
    tracked.add(id);
    const bump = () => force((n) => n + 1);
    subscribers.add(bump);
    // A newly-mounted tile needs its own initial read; the shared snapshot may
    // predate it. Reading two booleans is cheap next to a full refresh.
    if (isNew || !loaded) {
      if (isFavorite(id)) snapshot.favs.add(id);
      if (inPlaylist(id)) snapshot.crated.add(id);
      loaded = true;
      bump();
    }
    return () => {
      subscribers.delete(bump);
      tracked.delete(id);
    };
  }, [id]);

  return { fav: snapshot.favs.has(id), inList: snapshot.crated.has(id) };
}
