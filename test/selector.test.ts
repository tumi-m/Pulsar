import { describe, it, expect } from "vitest";
import { parse, buildList, resolveGenres } from "@/lib/selector";
import type { Release } from "@/lib/types";
import type { MoodTag } from "@/lib/types";

/**
 * These lock the exact failure the Selector shipped with: asking for
 * "euphoric house to dance to" returned gospel compilations above real house.
 *
 * Two faults combined. The gospel ingest force-tagged every record it pulled
 * with mood "euphoric", and the scorer charged nothing for a genre that
 * contradicted the request — so a mislabelled record rode one mood hit plus
 * the word "house" in its title straight to the top.
 */

const rel = (
  artist: string,
  title: string,
  genre: string | null,
  mood: MoodTag | null,
  date = "2015-01-01"
): Release => ({
  id: `${artist}-${title}`.toLowerCase().replace(/\W+/g, "-"),
  artist,
  title,
  type: "album",
  artwork_url: "",
  release_date: date,
  genre,
  tags: genre ? [genre.toLowerCase()] : [],
  mood,
  spotify: null,
  apple_music: null,
  tidal: null,
  soundcloud: null,
  youtube_music: null,
  boomplay: null,
  created_at: `${date}T00:00:00Z`,
  curator_note: null,
});

// The exact records from the bug report, with the tags they actually carried.
const MISLABELLED_GOSPEL = rel(
  "Various Artists",
  "Club Ibiza, Vol. 2 (Chillhouse Vibes)",
  "Gospel",
  "euphoric"
);
const MISLABELLED_GOSPEL_2 = rel(
  "Various Artists",
  "The View (50 Deephouse Grooves)",
  "Gospel",
  "euphoric"
);
const REAL_HOUSE = rel("Kerri Chandler", "Spaces and Places", "House", "hypnotic");
const REAL_DANCE = rel("DJ Snake", "Carte Blanche", "Dance", "euphoric");

describe("parse", () => {
  it("reads both the mood and the genres out of a plain request", () => {
    const p = parse("euphoric house to dance to");
    expect(p.moods).toContain("euphoric");
    expect(p.genres).toContain("House");
    expect(p.genres).toContain("Electronic"); // "dance"
  });

  it("reads a decade as a prefix covering all ten years, not one", () => {
    // Regression: this pushed "1990", so release_date.startsWith("1990")
    // matched only 1990 itself and "more 80s" returned almost nothing.
    expect(parse("energetic 90s hip-hop").decades).toContain("199");
    expect(parse("more 80s").decades).toContain("198");
  });

  it("matches records across the whole decade", () => {
    const p = parse("80s pop");
    const mid = rel("Prince", "Purple Rain", "Pop", "euphoric", "1984-06-25");
    const late = rel("Michael Jackson", "Bad", "Pop", "euphoric", "1987-08-31");
    const out = buildList([mid, late], p);
    expect(out).toHaveLength(2);
  });
});

describe("buildList ranking", () => {
  const p = parse("euphoric house to dance to");

  it("ranks a real house record above a gospel-tagged one whose title says house", () => {
    const out = buildList([MISLABELLED_GOSPEL, MISLABELLED_GOSPEL_2, REAL_HOUSE, REAL_DANCE], p);
    const titles = out.map((r) => r.title);
    expect(titles[0]).not.toMatch(/Club Ibiza|Deephouse Grooves/);
    const firstHouse = out.findIndex((r) => r.genre === "House" || r.genre === "Dance");
    const firstGospel = out.findIndex((r) => r.genre === "Gospel");
    expect(firstHouse).toBeGreaterThan(-1);
    if (firstGospel > -1) expect(firstHouse).toBeLessThan(firstGospel);
  });

  it("drops a contradicting genre out of the results entirely when nothing else matches", () => {
    // Gospel, euphoric, and no query word in the metadata: -4 + 2 = -2.
    const quiet = rel("Joyous Celebration", "Live in Durban", "Gospel", "euphoric");
    expect(buildList([quiet], p)).toEqual([]);
  });

  it("still returns gospel when gospel is what you asked for", () => {
    const g = parse("uplifting gospel worship");
    const out = buildList([rel("Kirk Franklin", "Hero", "Gospel", "euphoric")], g);
    expect(out).toHaveLength(1);
  });

  it("does not penalise anything when the request names no genre", () => {
    const moodOnly = parse("something euphoric");
    const out = buildList([MISLABELLED_GOSPEL, REAL_DANCE], moodOnly);
    expect(out.length).toBe(2);
  });

  it("keeps a matching genre ahead of a mere title keyword", () => {
    // "Housework" contains "house" as a substring but is a rock record.
    const decoy = rel("Some Band", "Housework", "Rock", "raw");
    const out = buildList([decoy, REAL_HOUSE], parse("house"));
    expect(out[0].genre).toBe("House");
  });
});

describe("descriptor tags", () => {
  it("matches a request against how a record is described, not just its title", () => {
    // The whole point: "for a rainy day" should reach a record somebody
    // described that way, even though those words appear in no title.
    const described: Release = {
      ...rel("Nils Frahm", "Spaces", "Modern Classical", "ambient"),
      tags: ["modern classical", "sparse piano", "rainy day", "slow", "intimate"],
    };
    const undescribed = rel("Some Band", "Rainy Day Anthem", "Rock", "raw");
    const out = buildList([undescribed, described], parse("something sparse for a rainy day"));
    expect(out[0].artist).toBe("Nils Frahm");
  });

  it("scores a descriptor tag above an incidental title word", () => {
    const tagged: Release = {
      ...rel("Burial", "Untrue", "Electronic", "melancholic"),
      tags: ["electronic", "late night", "crackling", "sparse"],
    };
    const titleOnly = rel("Nobody", "Late Night Party Smash", "Pop", "euphoric");
    const out = buildList([titleOnly, tagged], parse("late night"));
    expect(out[0].artist).toBe("Burial");
  });

  it("still works for records that carry no descriptors at all", () => {
    // Most of the catalogue is unenriched; it must not be pushed out.
    const bare = rel("Kerri Chandler", "Spaces and Places", "House", "hypnotic");
    expect(buildList([bare], parse("house"))).toHaveLength(1);
  });
});

describe("resolveGenres", () => {
  it("maps the model's free-form genres onto real buckets", () => {
    expect(resolveGenres(["boom bap"]).buckets).toEqual(["Hip-Hop"]);
    expect(resolveGenres(["neo-soul"]).buckets).toEqual(["Soul / R&B"]);
    expect(resolveGenres(["shoegaze"]).buckets).toEqual(["Rock"]);
    expect(resolveGenres(["amapiano"]).buckets).toEqual(["Amapiano"]);
  });

  it("passes bucket names through unchanged", () => {
    expect(resolveGenres(["House", "Gospel"]).buckets).toEqual(["House", "Gospel"]);
  });

  it("returns unmappable terms as leftover instead of poisoning the filter", () => {
    const { buckets, leftover } = resolveGenres(["chillwave"]);
    expect(buckets).toEqual([]);
    expect(leftover).toEqual(["chillwave"]);
  });

  it("never emits duplicates", () => {
    expect(resolveGenres(["rap", "hip-hop", "trap"]).buckets).toEqual(["Hip-Hop"]);
  });

  it("stops an unmappable genre from penalising every genred record", () => {
    // The shipped bug: "chillwave" entered p.genres, matched no bucket, and the
    // mismatch branch then charged -4 to every record that HAD a genre — so a
    // genre-less compilation won on a title word alone.
    const { buckets } = resolveGenres(["chillwave"]);
    const real = rel("Washed Out", "Within and Without", "Electronic", "hypnotic");
    const genreless: Release = { ...rel("Various Artists", "Chill Drives", null, null), tags: [] };
    const out = buildList([genreless, real], {
      moods: ["hypnotic"],
      genres: buckets,
      decades: [],
      freeText: "dreamy chillwave for a late-night drive",
    });
    // With no usable genre signal, neither is penalised — and the record that
    // actually matches the mood is not beaten by a title coincidence.
    expect(out[0].artist).toBe("Washed Out");
  });
});
