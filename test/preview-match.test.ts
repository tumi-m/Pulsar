import { describe, it, expect } from "vitest";
import {
  isCompilation,
  artistMatches,
  titleCloseness,
  candidateAcceptable,
} from "@/lib/preview-match";

/**
 * The bug these pin down: every result in a Selector search for "dreamy
 * chillwave for a late-night drive" was a "Various Artists" compilation, and
 * every one of them showed "No preview available".
 *
 * The preview resolver required the candidate track's artist to match the
 * release's artist. On a compilation the store credits each TRACK to its actual
 * performer, so the comparison was always "Tame Impala" vs "Various Artists" —
 * false, every time, for every candidate. No compilation could ever play.
 */

describe("isCompilation", () => {
  it("recognises the ways stores credit a compilation", () => {
    for (const s of ["Various Artists", "various artists", "Various Artist", "VA", "V.A.", "Various", "  Compilation  "]) {
      expect(isCompilation(s), s).toBe(true);
    }
  });

  it("does not mistake a real artist for one", () => {
    for (const s of ["Various Production", "Vampire Weekend", "Va Va Voom", "Toro y Moi", ""]) {
      expect(isCompilation(s), s).toBe(false);
    }
  });
});

describe("the original failure", () => {
  it("rejected every real performer on a compilation", () => {
    // This is what shipped: the guard could never pass.
    for (const performer of ["Tame Impala", "Washed Out", "Toro y Moi", "Ariana Grande"]) {
      expect(artistMatches(performer, "Various Artists"), performer).toBe(false);
    }
  });

  it("now accepts them when the ALBUM is the one we asked for", () => {
    expect(
      candidateAcceptable({
        wantedArtist: "Various Artists",
        wantedTitle: "Chill Drives",
        candidateArtist: "Tame Impala",
        candidateAlbum: "Chill Drives",
      })
    ).toBe(true);
  });

  it("still refuses a track from a DIFFERENT album", () => {
    // Dropping the artist check must not become "accept anything".
    expect(
      candidateAcceptable({
        wantedArtist: "Various Artists",
        wantedTitle: "Chill Drives",
        candidateArtist: "Tame Impala",
        candidateAlbum: "Currents",
      })
    ).toBe(false);
  });
});

describe("normal releases are unaffected", () => {
  it("still requires the artist to match", () => {
    expect(
      candidateAcceptable({
        wantedArtist: "Burial",
        wantedTitle: "Untrue",
        candidateArtist: "Some Other Act",
        candidateAlbum: "Untrue",
      })
    ).toBe(false);
  });

  it("accepts the right artist", () => {
    expect(
      candidateAcceptable({
        wantedArtist: "Burial",
        wantedTitle: "Untrue",
        candidateArtist: "Burial",
        candidateAlbum: "Untrue",
      })
    ).toBe(true);
  });

  it("tolerates featured-artist credits", () => {
    expect(artistMatches("Beyoncé feat. Jay-Z", "Beyoncé")).toBe(true);
  });
});

describe("titleCloseness", () => {
  it("scores exact above partial above unrelated", () => {
    expect(titleCloseness("Chill Drives", "Chill Drives")).toBe(2);
    expect(titleCloseness("Chill Drives (Deluxe)", "Chill Drives")).toBe(2);
    expect(titleCloseness("Chill Drives, Vol. 2", "Chill Drives")).toBe(1);
    expect(titleCloseness("Pop Drive", "Chill Drives")).toBe(0);
  });
});
