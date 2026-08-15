import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  randomString,
  sha256,
  base64url,
  redirectUri,
  saveToken,
  readToken,
  clearToken,
  savePending,
  readPending,
  clearPending,
  searchTerm,
} from "@/lib/dsp/shared";
import type { Release } from "@/lib/types";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("randomString", () => {
  it("returns a hex string of 2 chars per requested byte", () => {
    const s = randomString(16);
    expect(s).toHaveLength(32); // 16 bytes → 32 hex chars
    expect(s).toMatch(/^[0-9a-f]+$/);
  });
  it("produces different output across calls", () => {
    expect(randomString(32)).not.toBe(randomString(32));
  });
});

describe("sha256 / base64url", () => {
  it("sha256 returns a 32-byte digest", async () => {
    const buf = await sha256("hello");
    expect((buf as ArrayBuffer).byteLength).toBe(32);
  });
  it("base64url is URL-safe (no +, / or padding)", () => {
    const enc = base64url(new Uint8Array([0, 1, 2, 250, 255]).buffer);
    expect(enc).not.toContain("+");
    expect(enc).not.toContain("/");
    expect(enc).not.toContain("=");
  });
  it("sha256 + base64url round-trips to a stable challenge", async () => {
    const a = base64url(await sha256("verifier"));
    const b = base64url(await sha256("verifier"));
    expect(a).toBe(b);
  });
});

describe("redirectUri", () => {
  it("is the site origin + '/'", () => {
    expect(redirectUri()).toBe(`${window.location.origin}/`);
  });
});

describe("token storage", () => {
  it("save/read/clear a token", () => {
    saveToken("spotify", "abc", 3600);
    const t = readToken("spotify");
    expect(t?.access_token).toBe("abc");
    expect(t?.expires_at).toBeGreaterThan(Date.now());
    clearToken("spotify");
    expect(readToken("spotify")).toBeNull();
  });
  it("returns null for a missing token", () => {
    expect(readToken("nope")).toBeNull();
  });
  it("returns null when expired", () => {
    saveToken("spotify", "abc", -100);
    expect(readToken("spotify")).toBeNull();
  });
});

describe("pending crate persistence", () => {
  const releases: Release[] = [
    { id: "1", artist: "A", title: "T", type: "album" } as Release,
    { id: "2", artist: "B", title: "U", type: "single" } as Release,
  ];
  it("saves a slim copy and reads it back", () => {
    savePending({ provider: "spotify", name: "Mix", releases });
    const p = readPending();
    expect(p).not.toBeNull();
    expect(p!.provider).toBe("spotify");
    expect(p!.name).toBe("Mix");
    expect(p!.releases).toHaveLength(2);
    // Only id/artist/title/type are kept (the slim shape).
    expect(p!.releases[0]).toEqual({ id: "1", artist: "A", title: "T", type: "album" });
  });
  it("clears the pending crate", () => {
    savePending({ provider: "spotify", name: "Mix", releases });
    clearPending();
    expect(readPending()).toBeNull();
  });
  it("returns null when nothing is pending", () => {
    expect(readPending()).toBeNull();
  });
});

describe("searchTerm", () => {
  it("joins artist and title, stripping quotes", () => {
    const r = { artist: 'Burna "BB" Boy', title: "L's", type: "album" } as Release;
    expect(searchTerm(r)).toBe("Burna BB Boy Ls");
  });
  it("trims surrounding whitespace", () => {
    const r = { artist: "  A  ", title: "  B  ", type: "album" } as Release;
    expect(searchTerm(r)).toBe("A B");
  });
});