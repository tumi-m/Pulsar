import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanUrl } from "@/lib/supabase";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe("cleanUrl", () => {
  const set = (v: string) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = v;
  };

  it("returns '' when no URL is set", () => {
    expect(cleanUrl()).toBe("");
  });

  it("reduces a bare origin", () => {
    set("https://abcdefgh.supabase.co");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("strips a trailing slash", () => {
    set("https://abcdefgh.supabase.co/");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("strips the full /rest/v1/ REST endpoint", () => {
    set("https://abcdefgh.supabase.co/rest/v1/");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
    set("https://abcdefgh.supabase.co/rest/v1/releases");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("drops any path, query and trailing slash via URL parsing", () => {
    set("https://abcdefgh.supabase.co/some/path?x=1");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("trims surrounding whitespace", () => {
    set("  https://abcdefgh.supabase.co  ");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("falls back to regex trimming for an unparseable URL", () => {
    set("not a url at all");
    expect(cleanUrl()).toBe("not a url at all");
    set("https://example.supabase.co/rest/v1");
    // Still parseable → origin; the regex path is only for non-URLs.
    expect(cleanUrl()).toBe("https://example.supabase.co");
  });
});