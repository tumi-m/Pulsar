import { describe, it, expect } from "vitest";

// Mirror of the sanitizer in lib/supabase.ts searchReleases — the contract is
// that PostgREST .or() control characters never survive into the filter.
const sanitize = (term: string) => term.replace(/[%_\\,()"']/g, " ").trim();

describe("searchReleases sanitizer", () => {
  it("strips PostgREST or() control characters", () => {
    expect(sanitize('a),title.eq.pwned,(b')).toBe("a  title.eq.pwned  b");
  });

  it("strips LIKE wildcards", () => {
    expect(sanitize("100%_pure")).toBe("100  pure");
  });

  it("strips quotes and backslashes", () => {
    expect(sanitize('o"brien\\')).toBe("o brien");
  });

  it("keeps plain words intact", () => {
    expect(sanitize("burial")).toBe("burial");
    expect(sanitize("mellow and sleazy")).toBe("mellow and sleazy");
  });

  it("collapses to empty when only metacharacters", () => {
    expect(sanitize("%_,()'\"\\")).toBe("");
  });
});