import { describe, it, expect } from "vitest";
import {
  SAMPLE_CATALOG,
  lookupCatalog,
  mostSampledSources,
  catalogSamplers,
} from "@/lib/samples-catalog";

describe("lookupCatalog", () => {
  it("finds what a track samples", () => {
    const hits = lookupCatalog("Kanye West", "Stronger");
    expect(hits.some((h) => h.role === "samples" && /daft punk/i.test(h.artist))).toBe(true);
  });

  it("finds what sampled a track (reverse direction)", () => {
    const hits = lookupCatalog("Daft Punk", "Harder, Better, Faster, Stronger");
    expect(hits.some((h) => h.role === "sampledBy" && /kanye/i.test(h.artist))).toBe(true);
  });

  it("matches loosely across shorthand and punctuation", () => {
    const hits = lookupCatalog("The Notorious B.I.G.", "Big Poppa");
    expect(hits.some((h) => /between the sheets/i.test(h.title))).toBe(true);
  });

  it("returns [] for a track with no documented samples", () => {
    expect(lookupCatalog("Nobody Real", "A Song That Does Not Sample")).toEqual([]);
  });

  it("flags interpolations as partial", () => {
    const hits = lookupCatalog("Kanye West", "All Falls Down");
    const hit = hits.find((h) => /mystery of iniquity/i.test(h.title));
    expect(hit?.partial).toBe(true);
  });

  it("includes the new golden-age additions", () => {
    expect(
      lookupCatalog("Mobb Deep", "Shook Ones, Pt. II").some((h) => /jessica/i.test(h.title))
    ).toBe(true);
    expect(
      lookupCatalog("Mariah Carey", "Fantasy").some((h) => /genius of love/i.test(h.title))
    ).toBe(true);
  });
});

describe("SAMPLE_CATALOG integrity", () => {
  it("every entry has a real source artist and title (no empty placeholders)", () => {
    for (const e of SAMPLE_CATALOG) {
      expect(e.artist.trim().length).toBeGreaterThan(0);
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.sourceArtist.trim().length).toBeGreaterThan(0);
      expect(e.sourceTitle.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate connections (same song → same source)", () => {
    const norm = (s: string) =>
      s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
    const seen = new Set<string>();
    for (const e of SAMPLE_CATALOG) {
      const k = `${norm(e.artist)}::${norm(e.sourceArtist)}::${norm(e.sourceTitle)}`;
      expect(seen.has(k), `duplicate: ${e.artist} → ${e.sourceArtist} — ${e.sourceTitle}`).toBe(false);
      seen.add(k);
    }
  });
});

describe("mostSampledSources", () => {
  it("counts every taker per source record", () => {
    // A source that is known to be lifted from repeatedly.
    const rows = mostSampledSources(100);
    // Aggregate independently and compare — the function must agree with the
    // raw catalog, not just return something plausible.
    const counts = new Map<string, number>();
    for (const c of SAMPLE_CATALOG) {
      const k = `${c.sourceArtist}::${c.sourceTitle}`.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const row of rows) {
      expect(row.count).toBe(counts.get(`${row.artist}::${row.title}`.toLowerCase()));
      expect(row.takers.length).toBe(row.count);
    }
  });

  it("sorts by count, descending", () => {
    const rows = mostSampledSources(10);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].count).toBeGreaterThanOrEqual(rows[i].count);
    }
  });

  it("respects the limit", () => {
    expect(mostSampledSources(3)).toHaveLength(3);
  });

  it("carries the source year through", () => {
    const rows = mostSampledSources(100);
    // Almost every curated source has a year; at minimum the field exists.
    for (const r of rows) {
      expect(r.year === null || typeof r.year === "string").toBe(true);
    }
  });
});

describe("catalogSamplers", () => {
  it("counts distinct sources per song and sorts descending", () => {
    const rows = catalogSamplers(10);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].sources).toBeGreaterThanOrEqual(rows[i].sources);
    }
    // Cross-check the top row against a hand-rolled aggregate.
    const counts = new Map<string, number>();
    for (const c of SAMPLE_CATALOG) {
      const k = `${c.artist}::${c.title}`.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const max = Math.max(...counts.values());
    expect(rows[0].sources).toBe(max);
  });

  it("respects the limit", () => {
    expect(catalogSamplers(2)).toHaveLength(2);
  });

  it("returns at least one sampler from the seeded catalog", () => {
    const rows = catalogSamplers(100);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].sources).toBeGreaterThan(0);
  });
});
