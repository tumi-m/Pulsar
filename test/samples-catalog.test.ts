import { describe, it, expect } from "vitest";
import { SAMPLE_CATALOG, lookupCatalog } from "@/lib/samples-catalog";

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
});
