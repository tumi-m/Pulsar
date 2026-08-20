import { describe, it, expect } from "vitest";

/**
 * The rerank route hands back INDEXES into the candidate list, and the client
 * reorders by them. A hallucinated or duplicated index would quietly promote
 * the wrong record — or crash on undefined — so the validation is the part
 * worth pinning down.
 *
 * These mirror the `clean()` helper in app/api/rerank/route.ts and the
 * reordering in AiChat's rerank(). Kept as pure functions here so the contract
 * is testable without standing up the model.
 */

/** Exactly the validation the route applies to the model's answer. */
function clean(v: unknown, candidateCount: number): number[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of v) {
    const i = typeof n === "number" ? n : Number(n);
    if (!Number.isInteger(i) || i < 0 || i >= candidateCount) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  return out;
}

/** Exactly the reordering the client applies. */
function reorder<T>(head: T[], order: number[], drop: number[]): T[] {
  const dropped = new Set(drop);
  const taken = new Set(order);
  return [
    ...order.map((i) => head[i]).filter(Boolean),
    ...head.filter((_, i) => !taken.has(i) && !dropped.has(i)),
    ...head.filter((_, i) => dropped.has(i)),
  ];
}

const HEAD = ["a", "b", "c", "d", "e"];

describe("rerank index validation", () => {
  it("discards indexes the model invented", () => {
    expect(clean([0, 99, 2, -1, 4.5], HEAD.length)).toEqual([0, 2]);
  });

  it("discards duplicates so a record can't appear twice", () => {
    expect(clean([1, 1, 2, 2, 1], HEAD.length)).toEqual([1, 2]);
  });

  it("accepts numeric strings, since JSON output isn't always typed", () => {
    expect(clean(["0", "3"], HEAD.length)).toEqual([0, 3]);
  });

  it("returns nothing for a non-array", () => {
    expect(clean("nope", HEAD.length)).toEqual([]);
    expect(clean(null, HEAD.length)).toEqual([]);
  });
});

describe("rerank reordering", () => {
  it("puts the model's picks first, in its order", () => {
    expect(reorder(HEAD, [3, 0], [])).toEqual(["d", "a", "b", "c", "e"]);
  });

  it("never loses a record — rejects go last rather than vanishing", () => {
    const out = reorder(HEAD, [4], [0, 1]);
    expect(out).toHaveLength(HEAD.length);
    expect(out).toEqual(["e", "c", "d", "a", "b"]);
  });

  it("keeps unjudged records in their original relative order", () => {
    const out = reorder(HEAD, [2], []);
    expect(out).toEqual(["c", "a", "b", "d", "e"]);
  });

  it("is a no-op when the model ranks nothing", () => {
    expect(reorder(HEAD, [], [])).toEqual(HEAD);
  });

  it("never emits undefined even if validation were bypassed", () => {
    // Belt and braces: the .filter(Boolean) in the client must hold.
    expect(reorder(HEAD, [0, 99], []).every(Boolean)).toBe(true);
  });
});
