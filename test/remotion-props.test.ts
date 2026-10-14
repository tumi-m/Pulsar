import { describe, expect, it } from "vitest";
import {
  accentFor,
  calculateCrateRecapMetadata,
  clip,
  initialOf,
  normalizeRecapProps,
  reelAngle,
  reelPack,
  recapDurationInFrames,
  recapTimeline,
  recordIndexAt,
  secondaryAccentFor,
  slugify,
  yearOf,
  REEL_EMPTY,
  REEL_FULL,
  TITLE_MAX,
  type CrateRecapProps,
} from "@/remotion/props";
import { recapPropsFromReleases } from "@/remotion/from-releases";
import { ACCENTS, MAX_RECORDS, RECAP_FPS } from "@/remotion/tokens";
import { jcardAccent } from "@/components/Artwork";
import type { Release } from "@/lib/types";

const rec = (title: string, artist = "Artist") => ({ title, artist });

describe("Crate Recap duration", () => {
  it("is a 2 s intro, 1.6 s a record and a 2 s outro at 30 fps", () => {
    expect(recapDurationInFrames(0)).toBe(60 + 60);
    expect(recapDurationInFrames(1)).toBe(60 + 48 + 60);
    expect(recapDurationInFrames(3)).toBe(264); // the sample: 8.8 s
  });

  it("caps at twelve records (~23 s, under the 24 s soundtrack)", () => {
    expect(recapDurationInFrames(12)).toBe(60 + 12 * 48 + 60);
    expect(recapDurationInFrames(40)).toBe(recapDurationInFrames(12));
    expect(recapDurationInFrames(12) / RECAP_FPS).toBeLessThan(24);
  });

  it("derives frames from the fps it is given", () => {
    const t = recapTimeline(2, 60);
    expect(t.intro).toBe(120);
    expect(t.perRecord).toBe(96);
    expect(t.total).toBe(120 + 2 * 96 + 120);
  });

  it("treats junk counts as an empty crate rather than NaN frames", () => {
    expect(recapDurationInFrames(Number.NaN)).toBe(120);
    expect(recapDurationInFrames(-3)).toBe(120);
    expect(recapDurationInFrames(2.9)).toBe(recapDurationInFrames(2));
  });

  it("places the outro straight after the last record", () => {
    const t = recapTimeline(5);
    expect(t.outroStart).toBe(t.intro + 5 * t.perRecord);
    expect(t.total - t.outroStart).toBe(t.outro);
  });
});

describe("recordIndexAt", () => {
  const t = recapTimeline(3);
  it("is 0 in the intro and the outro", () => {
    expect(recordIndexAt(0, t)).toBe(0);
    expect(recordIndexAt(t.intro - 1, t)).toBe(0);
    expect(recordIndexAt(t.outroStart, t)).toBe(0);
  });
  it("counts records from 1 across their slots", () => {
    expect(recordIndexAt(t.intro, t)).toBe(1);
    expect(recordIndexAt(t.intro + t.perRecord - 1, t)).toBe(1);
    expect(recordIndexAt(t.intro + t.perRecord, t)).toBe(2);
    expect(recordIndexAt(t.outroStart - 1, t)).toBe(3);
  });
});

describe("normalizeRecapProps", () => {
  it("keeps the first twelve records and remembers how many there were", () => {
    const records = Array.from({ length: 20 }, (_, i) => rec(`Album ${i + 1}`));
    const out = normalizeRecapProps({ crateName: "Big", records });
    expect(out.records).toHaveLength(MAX_RECORDS);
    expect(out.records[0].title).toBe("Album 1");
    expect(out.records[11].title).toBe("Album 12");
    expect(out.totalRecords).toBe(20);
  });

  it("trusts a caller's totalRecords when the caller already capped the list", () => {
    const out = normalizeRecapProps({ crateName: "x", records: [rec("A")], totalRecords: 30 });
    expect(out.totalRecords).toBe(30);
    // …but never fewer than are actually shown
    expect(normalizeRecapProps({ crateName: "x", records: [rec("A"), rec("B")], totalRecords: 1 }).totalRecords).toBe(2);
  });

  it("handles an empty or missing crate", () => {
    for (const input of [undefined, null, {}, { crateName: "  ", records: [] }] as Partial<CrateRecapProps>[]) {
      const out = normalizeRecapProps(input);
      expect(out.records).toEqual([]);
      expect(out.totalRecords).toBe(0);
      expect(out.crateName).toBe("Untitled crate");
      expect(out.withAudio).toBe(false);
    }
  });

  it("drops records with nothing to show and fills a missing half", () => {
    const out = normalizeRecapProps({
      crateName: "Mixed",
      records: [
        { title: "", artist: "" },
        { title: "   ", artist: "Solo Artist" },
        { title: "Lonely Title", artist: "" },
        null as unknown as CrateRecapProps["records"][number],
      ],
    });
    expect(out.records.map((r) => [r.title, r.artist])).toEqual([
      ["Untitled", "Solo Artist"],
      ["Lonely Title", "Unknown artist"],
    ]);
  });

  it("bounds long text and collapses whitespace", () => {
    const out = normalizeRecapProps({
      crateName: "A crate name that goes on and on and on well past what fits on a card",
      records: [rec("The  Rise and Fall of Ziggy Stardust and the Spiders from Mars (2012 Remaster, Deluxe)")],
    });
    expect(out.crateName.length).toBeLessThanOrEqual(48);
    expect(out.crateName.endsWith("…")).toBe(true);
    // The title is only bounded here; what fits on the card is fit.ts's call.
    expect(out.records[0].title).toBe("The Rise and Fall of Ziggy Stardust and the Spiders from Mars (2012 Remaster, Deluxe)");
    expect(normalizeRecapProps({ crateName: "x", records: [rec("x".repeat(500))] }).records[0].title.length).toBe(TITLE_MAX);
  });

  it("only keeps artwork URLs an <img> can load", () => {
    const urls = ["/api/artwork?artist=a&title=b", "https://i.scdn.co/x.jpg", "", "   ", "not a url", null, undefined];
    const expected = ["/api/artwork?artist=a&title=b", "https://i.scdn.co/x.jpg", null, null, null, null, null];
    const out = normalizeRecapProps({ crateName: "x", records: urls.map((u) => ({ ...rec("T"), artworkUrl: u })) });
    expect(out.records.map((r) => r.artworkUrl)).toEqual(expected);
    const fallbacks = normalizeRecapProps({ crateName: "x", records: urls.map((u) => ({ ...rec("T"), artworkFallbackUrl: u })) });
    expect(fallbacks.records.map((r) => r.artworkFallbackUrl)).toEqual(expected);
  });

  it("turns release dates into years", () => {
    expect(yearOf("2024-11-22")).toBe("2024");
    expect(yearOf("1999")).toBe("1999");
    expect(yearOf(2016)).toBe("2016");
    expect(yearOf("Released 1987 on vinyl")).toBe("1987");
    expect(yearOf("")).toBeNull();
    expect(yearOf("12345")).toBeNull();
    expect(yearOf(null)).toBeNull();
  });

  it("is idempotent, so the component can re-normalise what calculateMetadata produced", () => {
    const once = normalizeRecapProps({ crateName: " Road  Trip ", records: [rec("GNX", "Kendrick Lamar")], withAudio: true });
    expect(normalizeRecapProps(once)).toEqual(once);
  });

  it("only turns audio on when asked", () => {
    expect(normalizeRecapProps({ crateName: "x", records: [], withAudio: true }).withAudio).toBe(true);
    expect(normalizeRecapProps({ crateName: "x", records: [], withAudio: "yes" as unknown as boolean }).withAudio).toBe(false);
  });
});

describe("calculateCrateRecapMetadata", () => {
  it("sets the duration and hands the component normalised props", async () => {
    const records = Array.from({ length: 15 }, (_, i) => rec(`R${i}`));
    const meta = await calculateCrateRecapMetadata({
      props: { crateName: "Road Trip", records, withAudio: true },
      defaultProps: { crateName: "", records: [] },
      abortSignal: new AbortController().signal,
      compositionId: "CrateRecap",
      isRendering: true,
    });
    expect(meta.durationInFrames).toBe(recapDurationInFrames(12));
    expect(meta.fps).toBe(30);
    expect((meta.props as { records: unknown[] }).records).toHaveLength(12);
    expect(meta.defaultOutName).toBe("crate-recap-road-trip");
  });
});

const appRelease = (artist: string, title: string): Release => ({
  id: `${artist}-${title}`,
  artist,
  title,
  type: "album",
  artwork_url: "",
  release_date: "2024",
  genre: null,
  tags: [],
  mood: null,
  spotify: null,
  apple_music: null,
  tidal: null,
  soundcloud: null,
  youtube_music: null,
  boomplay: null,
  created_at: "",
  curator_note: null,
});

describe("look helpers", () => {
  // The crate panel draws a coverless record with
  //   jcardAccent(artist.toLowerCase()) and artist.charAt(0).toUpperCase()
  // (components/Artwork.tsx, ArtworkFallback). The video must draw the same tape.
  const shelf = [
    appRelease("Kendrick Lamar", "GNX"),
    appRelease("Charli xcx", "Brat"),
    appRelease("Frank Ocean", "Blonde"),
    appRelease("Daft Punk", "Random Access Memories"),
    appRelease("Christine and the Queens", "ÉPOQUE"),
    appRelease("$uicideboy$", "Long Term Effects of Suffering"),
  ];

  it("gives a coverless record the same stripe and initial as the app's J-card", () => {
    const { records } = normalizeRecapProps(recapPropsFromReleases("Shelf", shelf, false));
    records.forEach((r, i) => {
      const app = shelf[i];
      expect(accentFor(r.artist)).toBe(jcardAccent(app.artist.toLowerCase()));
      expect(initialOf(r.artist)).toBe(app.artist.charAt(0).toUpperCase());
      expect(ACCENTS).toContain(accentFor(r.artist));
    });
    // and the three sample records the review compared, by name
    expect(accentFor("Kendrick Lamar")).toBe(jcardAccent("kendrick lamar"));
    expect(accentFor("Charli xcx")).toBe(jcardAccent("charli xcx"));
    expect(accentFor("Frank Ocean")).toBe(jcardAccent("frank ocean"));
  });

  it("gives the cover band a colour other than the stripe, varied by title", () => {
    for (const artist of ["Kendrick Lamar", "Charli xcx", "a", "b", "c", "d", "e"]) {
      for (const title of ["GNX", "Brat", "Blonde", "x", "y", "z"]) {
        expect(secondaryAccentFor(artist, title)).not.toBe(accentFor(artist));
      }
    }
    // one artist's records aren't all the same tape
    const bands = new Set(["GNX", "DAMN.", "good kid", "Section.80", "untitled", "Mr. Morale"].map((t) => secondaryAccentFor("Kendrick Lamar", t)));
    expect(bands.size).toBeGreaterThan(1);
  });

  it("takes the initial as a whole character, or a note when there is none", () => {
    expect(initialOf("blonde")).toBe("B");
    expect(initialOf("  frank ocean")).toBe("F");
    expect(initialOf("1989")).toBe("1");
    expect(initialOf("𝔊host")).toBe("𝔊"); // an astral letter isn't split into half a surrogate pair
    expect(initialOf("")).toBe("♪");
  });

  it("slugs crate names for filenames", () => {
    expect(slugify("Road Trip")).toBe("road-trip");
    expect(slugify("Café  Löwe!!")).toBe("cafe-lowe");
    expect(slugify("★★★")).toBe("crate");
  });

  it("clips with an ellipsis only when needed", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("exactly ten", 11)).toBe("exactly ten");
    expect(clip("a bit too long", 8)).toBe("a bit t…");
    expect(clip(42, 8)).toBe("");
  });
});

describe("deck reels", () => {
  const total = recapDurationInFrames(3);

  it("winds tape from the supply reel onto the take-up reel", () => {
    expect(reelPack(0, "supply")).toBe(REEL_FULL);
    expect(reelPack(0, "takeup")).toBe(REEL_EMPTY);
    expect(reelPack(1, "supply")).toBe(REEL_EMPTY);
    expect(reelPack(1, "takeup")).toBe(REEL_FULL);
    expect(reelPack(0.5, "supply")).toBeCloseTo(reelPack(0.5, "takeup"));
  });

  it("never turns backwards", () => {
    for (const reel of ["supply", "takeup"] as const) {
      let last = -1;
      for (let f = 0; f <= total; f++) {
        const a = reelAngle(f, total, 30, reel);
        expect(a).toBeGreaterThanOrEqual(last);
        last = a;
      }
    }
  });

  it("turns the emptier reel faster, and coasts to a stop at the end", () => {
    const mid = Math.round(total * 0.2);
    const supplyEarly = reelAngle(mid + 1, total, 30, "supply") - reelAngle(mid, total, 30, "supply");
    const takeupEarly = reelAngle(mid + 1, total, 30, "takeup") - reelAngle(mid, total, 30, "takeup");
    // Early on the take-up reel holds less tape, so it spins faster.
    expect(takeupEarly).toBeGreaterThan(supplyEarly);
    // Coasting: the step into the last frame is a sliver of a full-speed one…
    const step = (f: number) => reelAngle(f, total, 30, "supply") - reelAngle(f - 1, total, 30, "supply");
    expect(step(total - 1)).toBeLessThan(step(mid) * 0.1);
    // …and the reels are at rest from the last frame on.
    const last = reelAngle(total - 1, total, 30, "supply");
    expect(reelAngle(total, total, 30, "supply")).toBe(last);
    expect(reelAngle(total + 50, total, 30, "supply")).toBe(last);
  });
});
