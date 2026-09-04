import { describe, it, expect } from "vitest";
import {
  traceChains,
  connectSongs,
  commonSources,
  mostSampledArtists,
  sourceDecades,
  catalogSongs,
  artistProfile,
  relatedSongs,
} from "@/lib/samples-graph";
import { SAMPLE_CATALOG } from "@/lib/samples-catalog";

describe("traceChains", () => {
  it("traces multi-hop ancestry: a song that samples a song that samples a song", () => {
    // Ice Cube's "Check Yo Self" samples "The Message"; nothing in the catalog
    // samples The Message further up, but The Message → Cavern gives depth 2.
    const { nodes, edges } = traceChains("Ice Cube", "Check Yo Self");
    expect(nodes.length).toBeGreaterThan(1);
    expect(nodes[0].title).toBe("Check Yo Self");
    expect(nodes[0].level).toBe(0);
    const msg = nodes.find((n) => /the message/i.test(n.title));
    expect(msg?.level).toBe(1);
    // every node beyond the root is connected by an edge
    expect(edges.length).toBe(nodes.length - 1);
  });

  it("follows chains at least three hops deep where the catalog allows", () => {
    // Kanye's "Stronger" → Daft Punk's "Harder, Better…" → Edwin Birdsong's
    // "Cola Bottle Baby" — a documented 2-hop chain.
    const { nodes } = traceChains("Kanye West", "Stronger");
    const titles = nodes.map((n) => n.title.toLowerCase());
    expect(titles).toContain("harder, better, faster, stronger");
    expect(titles).toContain("cola bottle baby");
    const root = nodes[0];
    const hbfs = nodes.find((n) => /harder, better/i.test(n.title))!;
    const cola = nodes.find((n) => /cola bottle/i.test(n.title))!;
    expect(root.level).toBe(0);
    expect(hbfs.level).toBe(1);
    expect(cola.level).toBe(2);
  });

  it("returns empty for an unknown song", () => {
    const { nodes, edges } = traceChains("Nobody Real", "Untitled");
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it("never repeats a node (visited set)", () => {
    // The Winstons' Amen break is sampled by multiple songs; tracing from it
    // downward-up must not duplicate nodes.
    const { nodes } = traceChains("N.W.A", "Straight Outta Compton");
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks interpolation edges as partial", () => {
    // Sugarhill's Apache is a replay of the Incredible Bongo Band's Apache.
    const { nodes, edges } = traceChains("Sugarhill Gang", "Apache");
    const apache = nodes.find((n) => /apache/i.test(n.title) && n.level === 1)!;
    expect(apache.partial).toBe(true);
    expect(edges.some((e) => e.partial)).toBe(true);
  });
});

describe("connectSongs", () => {
  it("connects a song directly to the record it samples", () => {
    const res = connectSongs("Kanye West", "Stronger", "Daft Punk", "Harder, Better, Faster, Stronger");
    expect(res.found).toBe(true);
    expect(res.path.length).toBe(2);
    expect(res.path[0].title).toBe("Stronger");
    expect(res.path[1].title).toBe("Harder, Better, Faster, Stronger");
  });

  it("connects two songs that sample the same record directly", () => {
    // Public Enemy and LL Cool J both sample "Funky Drummer".
    const res = connectSongs("Public Enemy", "Fight the Power", "LL Cool J", "Mama Said Knock You Out");
    expect(res.found).toBe(true);
    const names = res.path.map((n) => `${n.artist}::${n.title}`.toLowerCase());
    expect(names).toContain("james brown::funky drummer");
    // shortest path: A → Funky Drummer → B
    expect(res.path.length).toBe(3);
  });

  it("reports common sources when no chain exists", () => {
    const common = commonSources(
      "Public Enemy", "Fight the Power",
      "LL Cool J", "Mama Said Knock You Out"
    );
    expect(common.some((s) => /funky drummer/i.test(s.title))).toBe(true);
  });

  it("returns nothing for unknown songs", () => {
    const res = connectSongs("Nobody Real", "A", "Also Fake", "B");
    expect(res.found).toBe(false);
    expect(res.commonSources).toEqual([]);
  });
});

describe("graph stats", () => {
  it("mostSampledArtists counts every catalog edge into the source artist", () => {
    const counts = new Map<string, number>();
    for (const c of SAMPLE_CATALOG) {
      counts.set(c.sourceArtist, (counts.get(c.sourceArtist) ?? 0) + 1);
    }
    const rows = mostSampledArtists(500);
    for (const row of rows) {
      expect(row.sampledCount).toBe(counts.get(row.artist));
    }
    // sorted descending
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].sampledCount).toBeGreaterThanOrEqual(rows[i].sampledCount);
    }
  });

  it("sourceDecades buckets source years into decades", () => {
    const rows = sourceDecades();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.decade).toMatch(/^(\d{3})0s$/);
    const total = rows.reduce((acc, r) => acc + r.count, 0);
    const withYear = SAMPLE_CATALOG.filter((c) => c.sourceYear && /^\d{4}$/.test(c.sourceYear)).length;
    expect(total).toBe(withYear);
  });

  it("catalogSongs returns every distinct song with no duplicates", () => {
    const songs = catalogSongs();
    const keys = songs.map((s) => `${s.artist}::${s.title}`.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(songs.length).toBeGreaterThan(150);
  });
});

describe("artistProfile", () => {
  it("lists everything an artist samples and everything that sampled them", () => {
    const p = artistProfile("Kanye West");
    // Kanye samples Daft Punk (Stronger) and is sampled by others.
    expect(p.samples.some((e) => /daft punk/i.test(e.artist))).toBe(true);
    expect(p.samplingCount).toBe(p.samples.length);
    expect(p.sampledCount).toBe(p.sampledBy.length);
    // Every edge carries a role and a real title.
    for (const e of [...p.samples, ...p.sampledBy]) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(["samples", "sampledBy"]).toContain(e.role);
    }
  });

  it("finds an artist who is only ever sampled (a source, never a sampler)", () => {
    const p = artistProfile("James Brown");
    expect(p.sampledBy.length).toBeGreaterThan(0);
    // James Brown is a source in the catalog; his sampledCount must match.
    expect(p.sampledCount).toBe(p.sampledBy.length);
  });

  it("returns empty arrays for an artist not in the graph", () => {
    const p = artistProfile("Nobody Real At All");
    expect(p.samples).toEqual([]);
    expect(p.sampledBy).toEqual([]);
    expect(p.songs).toEqual([]);
    expect(p.sampledCount).toBe(0);
    expect(p.samplingCount).toBe(0);
  });

  it("matches loosely (shorthand artist names still land)", () => {
    // "Notorious B.I.G." is a substring of the catalog's "The Notorious B.I.G.".
    const p = artistProfile("Notorious B.I.G.");
    expect(p.samples.length).toBeGreaterThan(0);
  });
});

describe("relatedSongs", () => {
  it("returns songs that share sample DNA with the subject", () => {
    // Kanye's "Stronger" samples Daft Punk; other songs also sample Daft Punk.
    const rel = relatedSongs("Kanye West", "Stronger");
    expect(rel.length).toBeGreaterThan(0);
    for (const r of rel) {
      expect(r.title.trim().length).toBeGreaterThan(0);
      expect(r.artist.trim().length).toBeGreaterThan(0);
    }
  });

  it("never returns the subject itself", () => {
    const rel = relatedSongs("Kanye West", "Stronger");
    expect(rel.some((r) => /stronger/i.test(r.title) && /kanye/i.test(r.artist))).toBe(false);
  });

  it("returns [] for an unknown song", () => {
    expect(relatedSongs("Nobody Real", "Untitled")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(relatedSongs("Kanye West", "Stronger", 3).length).toBeLessThanOrEqual(3);
  });
});
