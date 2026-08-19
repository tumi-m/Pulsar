import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The samples feature was reported broken three times running, and the cause
 * was never the sample data — it was that the breakdown rendered UNDERNEATH the
 * panel that opened it.
 *
 * `SamplesExplorer` is `fixed inset-0` at z-57 and (since the opacity fix) a
 * genuinely opaque 98% background. `SamplePage` was z-56 and the explorer never
 * closed, so tapping a record on a phone painted the entire breakdown behind a
 * solid sheet: nothing appeared to happen at all.
 *
 * Two independent guards, because either alone would have prevented it:
 *   1. the breakdown must outrank every panel that can open it, and
 *   2. the explorer must stand down when it opens one.
 */

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

/** Highest `z-[NN]` Tailwind class in a file. */
function maxZ(src: string): number {
  const hits = [...src.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
    return hits.length ? Math.max(...hits) : -1;
}

describe("samples panel layering", () => {
  const explorer = read("components/SamplesExplorer.tsx");
  const breakdown = read("components/SamplePage.tsx");

  it("renders the breakdown above the explorer that opens it", () => {
    const zExplorer = maxZ(explorer);
    const zBreakdown = maxZ(breakdown);
    expect(zExplorer).toBeGreaterThan(0);
    expect(zBreakdown).toBeGreaterThan(0);
    expect(
      zBreakdown,
      `SamplePage is z-${zBreakdown} but SamplesExplorer is z-${zExplorer}. ` +
        `The explorer is a full-screen opaque panel, so a breakdown below it is invisible.`
    ).toBeGreaterThan(zExplorer);
  });

  it("closes the explorer when it opens a breakdown", () => {
    // setViewing({...}) must be accompanied by setOpen(false) in the same block.
    const idx = explorer.indexOf("setViewing({");
    expect(idx, "expected SamplesExplorer to open a breakdown via setViewing").toBeGreaterThan(-1);
    const block = explorer.slice(idx, idx + 900);
    expect(
      /setOpen\(false\)/.test(block),
      "SamplesExplorer must call setOpen(false) when it opens a breakdown, " +
        "or the breakdown renders underneath a full-screen opaque panel."
    ).toBe(true);
  });

  it("never leaves a sample card with no way to reach the record", () => {
    // The old card rendered a disabled player and the text "No video found",
    // which was a dead end. Every card must offer a YouTube route out.
    expect(breakdown).toContain("youtubeSearchUrl");
    expect(
      breakdown.includes('className="text-[10px] text-star-white/30">No video found'),
      "the bare 'No video found' dead end should be gone"
    ).toBe(false);
  });
});
