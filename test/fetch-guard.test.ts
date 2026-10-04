import { describe, it, expect } from "vitest";
import { checkFetchUrl } from "@/agent/fetch-guard";

describe("checkFetchUrl", () => {
  it("allows editorial and music hosts", () => {
    expect(checkFetchUrl("https://pitchfork.com/reviews/tracks/").ok).toBe(true);
    expect(checkFetchUrl("https://open.spotify.com/album/abc").ok).toBe(true);
    expect(checkFetchUrl("https://music.apple.com/us/album/x/1").ok).toBe(true);
    expect(checkFetchUrl("https://en.wikipedia.org/wiki/Amapiano").ok).toBe(true);
    expect(checkFetchUrl("https://www.thefader.com/2026/01/01/story").ok).toBe(true);
  });

  it("allows subdomains of allowed hosts", () => {
    expect(checkFetchUrl("https://f4.bcbits.com").ok).toBe(false); // bandcamp images host is not allowlisted — only pages
    expect(checkFetchUrl("https://residentadvisor.net/news/1").ok).toBe(true);
    expect(checkFetchUrl("https://ra.co/news/1").ok).toBe(false);
  });

  it("blocks unknown hosts", () => {
    expect(checkFetchUrl("https://evil.example.com/").ok).toBe(false);
    expect(checkFetchUrl("https://internal.wiki/secret").ok).toBe(false);
  });

  it("blocks internal metadata endpoints and private ranges", () => {
    expect(checkFetchUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
    expect(checkFetchUrl("http://localhost:3000/").ok).toBe(false);
    expect(checkFetchUrl("http://127.0.0.1/admin").ok).toBe(false);
    expect(checkFetchUrl("http://10.0.0.5/").ok).toBe(false);
    expect(checkFetchUrl("http://192.168.1.1/").ok).toBe(false);
    expect(checkFetchUrl("http://metadata.google.internal/computeMetadata/v1/").ok).toBe(false);
    expect(checkFetchUrl("http://db.internal/query").ok).toBe(false);
    expect(checkFetchUrl("http://[::1]:5432/").ok).toBe(false);
  });

  it("blocks non-http(s) schemes", () => {
    expect(checkFetchUrl("file:///etc/passwd").ok).toBe(false);
    expect(checkFetchUrl("ftp://pitchfork.com/x").ok).toBe(false);
    expect(checkFetchUrl("javascript:alert(1)").ok).toBe(false);
    expect(checkFetchUrl("data:text/html,hi").ok).toBe(false);
  });

  it("rejects unparseable input", () => {
    expect(checkFetchUrl("not a url").ok).toBe(false);
    expect(checkFetchUrl("").ok).toBe(false);
  });
});