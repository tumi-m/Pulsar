import { describe, it, expect } from "vitest";
import {
  clampCols,
  computeCols,
  gridGrouping,
  buildDateSections,
  GRID_MIN,
  GRID_MAX,
} from "@/lib/grid";
import type { Release } from "@/lib/types";

const rel = (artist: string, title: string, date: string): Release =>
  ({
    id: `${artist}-${title}`,
    artist,
    title,
    type: "album",
    artwork_url: "",
    release_date: date,
    genre: null,
    tags: [],
    mood: null,
    spotify: null,
    apple_music: null,
    tidal: null,
    soundcloud: null,
    youtube_music: null,
    created_at: `${date}T00:00:00Z`,
    curator_note: null,
  }) as Release;

describe("clampCols", () => {
  it("clamps to the 2–8 range", () => {
    expect(clampCols(0)).toBe(2);
    expect(clampCols(-3)).toBe(2);
    expect(clampCols(2)).toBe(2);
    expect(clampCols(5)).toBe(5);
    expect(clampCols(8)).toBe(8);
    expect(clampCols(100)).toBe(8);
  });
  it("exposes GRID_MIN=2 and GRID_MAX=8", () => {
    expect(GRID_MIN).toBe(2);
    expect(GRID_MAX).toBe(8);
  });
});

describe("computeCols", () => {
  it("adds zoom to base and clamps", () => {
    expect(computeCols(3, 0)).toBe(3);
    expect(computeCols(3, 2)).toBe(5);
    expect(computeCols(3, -2)).toBe(2); // clamped to min
    expect(computeCols(6, 5)).toBe(8); // clamped to max
  });
});

describe("gridGrouping — thresholds + Latest-view-only rule", () => {
  const base = { searching: false, detailOpen: false, view: "latest" };
  it("cols 5 → day, 6 → month, 7+ → year, <5 → none", () => {
    expect(gridGrouping({ ...base, cols: 4 })).toBe("none");
    expect(gridGrouping({ ...base, cols: 5 })).toBe("day");
    expect(gridGrouping({ ...base, cols: 6 })).toBe("month");
    expect(gridGrouping({ ...base, cols: 7 })).toBe("year");
    expect(gridGrouping({ ...base, cols: 8 })).toBe("year");
  });
  it("disabled while searching", () => {
    expect(gridGrouping({ cols: 7, view: "latest", searching: true, detailOpen: false })).toBe("none");
  });
  it("disabled while a detail sheet is open", () => {
    expect(gridGrouping({ cols: 7, view: "latest", searching: false, detailOpen: true })).toBe("none");
  });
  it("disabled outside the Latest view", () => {
    expect(gridGrouping({ cols: 7, view: "streamed", searching: false, detailOpen: false })).toBe("none");
    expect(gridGrouping({ cols: 7, view: "foryou", searching: false, detailOpen: false })).toBe("none");
  });
});

describe("buildDateSections", () => {
  const now = new Date("2026-07-28T10:00:00Z").getTime();

  it("returns [] for grouping none", () => {
    expect(buildDateSections([rel("A", "x", "2026-07-28")], "none", now)).toEqual([]);
  });

  it("groups by day and labels Today/Yesterday/formatDate", () => {
    const items = [
      rel("A", "a", "2026-07-28"), // Today
      rel("A", "b", "2026-07-28"), // same day → same section
      rel("B", "c", "2026-07-27"), // Yesterday
      rel("C", "d", "2026-07-20"), // formatted
    ];
    const out = buildDateSections(items, "day", now);
    expect(out).toHaveLength(3);
    expect(out[0].label).toBe("Today");
    expect(out[0].items).toHaveLength(2);
    expect(out[1].label).toBe("Yesterday");
    expect(out[2].label).toBe("Jul 20, 2026");
    // from indexes preserved
    expect(out[0].from).toBe(0);
    expect(out[1].from).toBe(2);
    expect(out[2].from).toBe(3);
  });

  it("groups by month", () => {
    const items = [
      rel("A", "a", "2026-07-10"),
      rel("A", "b", "2026-07-20"),
      rel("B", "c", "2026-06-05"),
    ];
    const out = buildDateSections(items, "month", now);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe("July 2026");
    expect(out[0].items).toHaveLength(2);
    expect(out[1].label).toBe("June 2026");
  });

  it("groups by year", () => {
    const items = [rel("A", "a", "2026-03-01"), rel("B", "b", "2025-11-09")];
    const out = buildDateSections(items, "year", now);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe("2026");
    expect(out[1].label).toBe("2025");
  });

  it("treats 1900-prefixed and empty dates as undated", () => {
    const items = [
      rel("A", "a", "2026-07-28"),
      { ...rel("B", "b", "1900-01-01") },
      { ...rel("C", "c", "") },
    ];
    const out = buildDateSections(items, "year", now);
    expect(out).toHaveLength(2);
    expect(out[1].key).toBe("undated");
    expect(out[1].label).toBe("Release date unknown");
    expect(out[1].items).toHaveLength(2);
  });
});