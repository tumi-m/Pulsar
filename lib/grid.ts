/**
 * Pulsar — Grid helpers (pure)
 *
 * Extracted from components/ReleaseGrid.tsx so the high-risk, behaviour-defining
 * grid logic — pinch→column clamping and the iOS-Photos-style date-section
 * grouping thresholds — is unit-testable without mounting the whole grid.
 *
 * Behaviour is identical to the inline implementation it replaced.
 */

import type { Release } from "./types";
import { formatDate } from "./utils";

export const GRID_MIN = 2;
export const GRID_MAX = 8;

/** Clamp a column count to the 2–8 range the grid supports. */
export function clampCols(n: number): number {
  return Math.max(GRID_MIN, Math.min(GRID_MAX, n));
}

/** Resolved column count from the width-derived base plus the pinch zoom delta. */
export function computeCols(baseCols: number, zoom: number): number {
  return clampCols(baseCols + zoom);
}

export type Grouping = "none" | "day" | "month" | "year";

export interface GroupingInputs {
  cols: number;
  /** Only the date-ordered "Latest" view groups; popularity/relevance views don't. */
  view: string;
  searching: boolean;
  detailOpen: boolean;
}

/**
 * Date-section grouping coarsens as you zoom out: day → month → year.
 * Thresholds: cols >= 5 → day, >= 6 → month, >= 7 → year. Disabled entirely
 * (a) outside the "latest" view, (b) while searching, (c) while a detail sheet
 * is open — the "Latest-view-only" rule.
 */
export function gridGrouping({ cols, view, searching, detailOpen }: GroupingInputs): Grouping {
  if (searching || view !== "latest" || detailOpen) return "none";
  if (cols >= 7) return "year";
  if (cols >= 6) return "month";
  if (cols >= 5) return "day";
  return "none";
}

export interface DateSection {
  key: string;
  label: string;
  items: Release[];
  from: number;
}

/**
 * Build dated sections from a newest-first list, preserving order and starting a
 * new section whenever the bucket key changes. `from` keeps each item's global
 * index so taste sizing / entrance stagger stay consistent with the flat grid.
 *
 * `now` is injectable so the "Today"/"Yesterday" labels are deterministic in tests.
 */
export function buildDateSections(
  releases: Release[],
  grouping: Grouping,
  now: number = Date.now(),
): DateSection[] {
  if (grouping === "none") return [];

  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);

  const bucketOf = (d: string): string => {
    if (!d || d.startsWith("1900")) return "undated";
    return grouping === "year" ? d.slice(0, 4) : grouping === "month" ? d.slice(0, 7) : d;
  };

  const labelOf = (d: string): string => {
    if (!d || d.startsWith("1900")) return "Release date unknown";
    if (grouping === "day") {
      if (d === today) return "Today";
      if (d === yesterday) return "Yesterday";
      return formatDate(d);
    }
    const dt = new Date(`${d.slice(0, 7)}-01T00:00:00Z`);
    if (grouping === "month") {
      return dt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    }
    return d.slice(0, 4);
  };

  const out: DateSection[] = [];
  releases.forEach((r, i) => {
    const key = bucketOf(r.release_date);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(r);
    else out.push({ key, label: labelOf(r.release_date), items: [r], from: i });
  });
  return out;
}