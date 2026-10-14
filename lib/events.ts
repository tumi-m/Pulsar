/**
 * Pulsar — typed window event bus.
 *
 * The app's overlays/tiles are decoupled through `window` CustomEvents. A
 * plain string API is silent on typos (a typo'd name just never fires), so
 * every live channel is declared here with its payload type. Dispatch through
 * `emit` and listen through `on` — both are type-checked.
 *
 * Retired channels (do not re-add): pulsar-visualizing, pulsar-close-detail,
 * pulsar-search, pulsar-ai-mode-change.
 */

import type { Release } from "./types";
import type { MediaFormat } from "./format";
import type { ShowType } from "./settings";

export interface PulsarEventMap {
  /** Collection (favorites/crates) changed in localStorage. No payload. */
  "pulsar-collection-change": undefined;
  /** Detail sheet opened/closed. boolean = open state. */
  "pulsar-detail-open": boolean;
  /** Open the album sheet for a release (track displays are stripped upstream). */
  "pulsar-open-release": Release;
  /** Open the sheet AND jump to the artist discography view. */
  "pulsar-open-discography": Release;
  /** Internal: detail sheet should switch to its discography tab. */
  "pulsar-show-discography": undefined;
  /** Toggle the sidebar. */
  "pulsar-toggle-sidebar": undefined;
  /** Open the crate picker for a release. */
  "pulsar-crate-picker": Release;
  /** Open the crate panel (boolean payload; legacy string accepted). */
  "pulsar-crate-open": boolean | string;
  /** Open the dock's panel on a specific crate ("favorites" | "playlist"). */
  "pulsar-open-crate": "favorites" | "playlist";
  /** Navbar hidden/shown by scroll. boolean = hidden. */
  "pulsar-nav-hidden": boolean;
  /** Activate the AI selector. */
  "pulsar-ai-activate": undefined;
  /** Open the samples explorer. */
  "pulsar-open-samples": undefined;
  /** Samples explorer opened/closed. boolean = open state. */
  "pulsar-samples-open": boolean;
  /** Physical media format changed. */
  "pulsar-format-change": MediaFormat;
  /** Release-type filter changed. */
  "pulsar-type-change": ShowType;
  /** Re-run the onboarding quiz. */
  "pulsar-retake-quiz": undefined;
  /** Theme changed. */
  "pulsar-theme-change": string;
}

export type PulsarEventName = keyof PulsarEventMap;

/** Dispatch a typed bus event. */
export function emit<K extends PulsarEventName>(
  name: K,
  ...detail: PulsarEventMap[K] extends undefined ? [] : [PulsarEventMap[K]]
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    detail.length ? new CustomEvent(name, { detail: detail[0] }) : new CustomEvent(name)
  );
}

/** Subscribe to a typed bus event; returns an unsubscribe function. */
export function on<K extends PulsarEventName>(
  name: K,
  handler: PulsarEventMap[K] extends undefined
    ? () => void
    : (detail: PulsarEventMap[K]) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as PulsarEventMap[K];
    (handler as (d?: unknown) => void)(detail);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}