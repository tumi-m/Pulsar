import { describe, it, expect } from "vitest";
import {
  normaliseTitle,
  normaliseArtist,
  titleMatches,
  artistMatches,
  pickBestMatch,
} from "@/lib/match";

describe("normaliseTitle", () => {
  it("lowercases and strips bracketed asides", () => {
    expect(normaliseTitle("Donda (Deluxe Edition)")).toBe("donda");
  });
  it("strips remaster/deluxe/edition tails after a dash", () => {
    expect(normaliseTitle("Donda - Remastered")).toBe("donda");
    expect(normaliseTitle("Album – Expanded Edition")).toBe("album");
  });
  it("converts & to 'and' and collapses punctuation to spaces", () => {
    expect(normaliseTitle("Me & You")).toBe("me and you");
  });
  it("handles null/undefined", () => {
    expect(normaliseTitle(null as unknown as string)).toBe("");
  });
});

describe("normaliseArtist", () => {
  it("lowercases and removes all non-alphanumerics", () => {
    expect(normaliseArtist("Burna Boy")).toBe("burnaboy");
    expect(normaliseArtist("A & B")).toBe("aandb");
  });
});

describe("titleMatches", () => {
  it("exact match after normalising", () => {
    expect(titleMatches("Donda", "Donda")).toBe(true);
    expect(titleMatches("Donda", "donda")).toBe(true);
  });
  it("rejects a numeric sequel — Donda vs Donda 2", () => {
    expect(titleMatches("Donda", "Donda 2")).toBe(false);
    expect(titleMatches("Donda", "Donda Vol 2")).toBe(false);
  });
  it("accepts an edition suffix — Donda vs Donda (Deluxe Edition)", () => {
    expect(titleMatches("Donda", "Donda (Deluxe Edition)")).toBe(true);
  });
  it("rejects unrelated titles — Bully vs Donda", () => {
    expect(titleMatches("Bully", "Donda")).toBe(false);
  });
  it("returns false for empty inputs", () => {
    expect(titleMatches("", "x")).toBe(false);
    expect(titleMatches("x", "")).toBe(false);
  });
});

describe("artistMatches", () => {
  it("exact match", () => {
    expect(artistMatches("Burna Boy", "Burna Boy")).toBe(true);
  });
  it("tolerates features / billing order", () => {
    expect(artistMatches("Burna Boy", "Burna Boy & Wizkid")).toBe(true);
    expect(artistMatches("Burna Boy", "Wizkid & Burna Boy")).toBe(true);
  });
  it("rejects a different artist", () => {
    expect(artistMatches("Burna Boy", "Wizkid")).toBe(false);
  });
});

describe("pickBestMatch", () => {
  const read = (c: { artist: string; title: string }) => c;
  it("filters out non-viable candidates and prefers an exact title", () => {
    const candidates = [
      { artist: "Kanye West", title: "Donda 2" }, // numeric sequel → not viable
      { artist: "Kanye West", title: "Donda Deluxe" }, // viable, edition (not exact-normalised)
      { artist: "Kanye West", title: "Donda" }, // viable, exact
    ];
    const best = pickBestMatch(candidates, { artist: "Kanye West", title: "Donda" }, read);
    expect(best).not.toBeNull();
    expect(best!.title).toBe("Donda");
  });
  it("returns null when no candidate matches both rules", () => {
    const candidates = [{ artist: "Other", title: "Donda" }];
    expect(pickBestMatch(candidates, { artist: "Kanye West", title: "Donda" }, read)).toBeNull();
  });
  it("returns the first viable when none is exact-normalised", () => {
    const candidates = [{ artist: "Kanye West", title: "Donda Deluxe" }];
    const best = pickBestMatch(candidates, { artist: "Kanye West", title: "Donda" }, read);
    expect(best).not.toBeNull();
    expect(best!.title).toBe("Donda Deluxe");
  });
});