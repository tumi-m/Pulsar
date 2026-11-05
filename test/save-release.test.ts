import { describe, it, expect } from "vitest";
import { saveRelease } from "@/lib/supabase";

/**
 * saveRelease against a fake PostgREST client that behaves like the real
 * schema AFTER migration 0003: the (artist, title) constraint is gone and only
 * the lower() expression index remains.
 *
 * The old code upserted with onConflict "artist,title". On that schema Postgres
 * rejects the statement outright (42P10) — it cannot infer an expression index
 * from a plain column list — so every new release failed to save. The fake
 * reproduces that, which is what makes the first test meaningful.
 */

type Row = { id: string; artist: string; title: string; created_at: string };

function fakeDb(seed: Row[] = [], opts: { raceOnInsert?: Row } = {}) {
  const rows = [...seed];
  const calls: string[] = [];
  let n = 0;
  const lower = (s: string) => s.toLowerCase();

  const from = () => {
    const q: Record<string, unknown> = {};
    const filters: [string, string][] = [];
    const api: Record<string, (...a: unknown[]) => unknown> = {
      select: () => api,
      ilike: (col: unknown, val: unknown) => (filters.push([col as string, val as string]), api),
      order: () => api,
      limit: async () => {
        calls.push("find");
        const hit = rows
          .filter((r) => filters.every(([c, v]) => lower((r as Record<string, string>)[c]) === lower(v)))
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return { data: hit.slice(0, 1).map((r) => ({ id: r.id })), error: null };
      },
      upsert: (_payload: unknown, o: unknown) => {
        q.op = "upsert";
        q.onConflict = (o as { onConflict?: string })?.onConflict;
        return api;
      },
      insert: (payload: unknown) => ((q.op = "insert"), (q.payload = payload), api),
      update: (payload: unknown) => ((q.op = "update"), (q.payload = payload), api),
      eq: (_c: unknown, v: unknown) => ((q.id = v), api),
      single: async () => {
        calls.push(q.op as string);
        if (q.op === "upsert" && q.onConflict === "artist,title")
          return {
            data: null,
            error: { code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" },
          };
        if (q.op === "insert") {
          const p = q.payload as { artist: string; title: string };
          if (opts.raceOnInsert) {
            rows.push(opts.raceOnInsert);
            opts.raceOnInsert = undefined;
          }
          if (rows.some((r) => lower(r.artist) === lower(p.artist) && lower(r.title) === lower(p.title)))
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          const row = { id: `new-${++n}`, created_at: "2026-01-01", ...p };
          rows.push(row);
          return { data: row, error: null };
        }
        if (q.op === "update") {
          const row = rows.find((r) => r.id === q.id);
          return { data: { ...row, ...(q.payload as object) }, error: null };
        }
        return { data: null, error: { message: "unexpected" } };
      },
    };
    return api;
  };
  return { db: { from } as never, rows, calls };
}

const release = {
  artist: "Burial",
  title: "Untrue",
  type: "album" as const,
  artwork_url: "https://example.test/a.jpg",
  release_date: "2007-11-05",
  spotify: null,
  apple_music: null,
  tidal: null,
  soundcloud: null,
  youtube_music: null,
};

describe("saveRelease on the post-0003 schema", () => {
  it("inserts a brand-new release instead of failing with 42P10", async () => {
    const { db, rows, calls } = fakeDb();
    const saved = await saveRelease(release, db);
    expect(saved.id).toMatch(/^new-/);
    expect(rows).toHaveLength(1);
    expect(calls).not.toContain("upsert");
  });

  it("updates the existing row for a case variant rather than duplicating it", async () => {
    const { db, rows, calls } = fakeDb([
      { id: "old", artist: "BURIAL", title: "untrue", created_at: "2020-01-01" },
    ]);
    const saved = await saveRelease(release, db);
    expect(saved.id).toBe("old");
    expect(rows).toHaveLength(1);
    expect(calls).toEqual(["find", "update"]);
  });

  it("recovers when a concurrent writer wins the race between lookup and insert", async () => {
    const { db, rows } = fakeDb([], {
      raceOnInsert: { id: "raced", artist: "burial", title: "UNTRUE", created_at: "2026-01-01" },
    });
    const saved = await saveRelease(release, db);
    expect(saved.id).toBe("raced");
    expect(rows).toHaveLength(1);
  });
});
