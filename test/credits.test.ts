import { describe, it, expect, beforeEach } from "vitest";
import {
  personSlug,
  registerAtomicArtists,
  _resetAtomicArtists,
  splitNames,
  parseCredits,
  mergeCredits,
  creditsFromDeezer,
  buildCreditGraph,
  topPeople,
} from "@/lib/credits";
import type { Release } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────

/** Assert a parsed credit list contains exactly the expected (name, role) pairs. */
function expectCredits(
  artist: string,
  title: string,
  expected: [string, string][]
) {
  const { credits } = parseCredits(artist, title);
  const got = credits.map((c) => [c.name, c.role] as [string, string]);
  expect(got).toEqual(expected);
}

function release(artist: string, title: string, date = "2026-08-15"): Release {
  return {
    id: `${artist}::${title}`,
    artist,
    title,
    type: "single",
    artwork_url: "https://example.com/a.jpg",
    release_date: date,
    genre: null,
    tags: [],
    mood: null,
    spotify: null,
    apple_music: null,
    tidal: null,
    soundcloud: null,
    youtube_music: null,
    boomplay: null,
    created_at: date + "T00:00:00Z",
    curator_note: null,
  };
}

// ── personSlug ───────────────────────────────────────────────────

describe("personSlug", () => {
  it("normalises case, accents and punctuation", () => {
    expect(personSlug("Kabza De Small")).toBe("kabza-de-small");
    expect(personSlug("Beyoncé")).toBe("beyonce");
    expect(personSlug("Earth, Wind & Fire")).toBe("earth-wind-and-fire");
    expect(personSlug("  Tyla  ")).toBe("tyla");
  });

  it("strips apostrophes (a known limitation: does not merge 'Inkos'yamagcokama' with 'Inkosi Yamagcokama')", () => {
    // The apostrophe is removed, not replaced with a space, so the two Apple
    // artist IDs for the same act do NOT collapse to one slug. This is a real
    // identity-split that a future alias table (people.aliases) must resolve.
    expect(personSlug("Inkos'yamagcokama")).toBe("inkosyamagcokama");
    expect(personSlug("Inkosi Yamagcokama")).toBe("inkosi-yamagcokama");
  });
});

// ── splitNames ───────────────────────────────────────────────────

describe("splitNames", () => {
  beforeEach(() => {
    _resetAtomicArtists();
    registerAtomicArtists([
      "Earth, Wind & Fire",
      "Mellow & Sleazy",
      "Wisin & Yandel",
    ]);
  });

  it("splits a plain collaboration", () => {
    expect(splitNames("Kabza De Small & DJ Maphorisa")).toEqual([
      "Kabza De Small",
      "DJ Maphorisa",
    ]);
  });

  it("keeps a compound name atomic", () => {
    expect(splitNames("Earth, Wind & Fire")).toEqual(["Earth, Wind & Fire"]);
  });

  it("keeps a compound name atomic inside a larger collaboration", () => {
    // Live Apple ZA: "Tman Xpress & Mellow & Sleazy".
    expect(splitNames("Tman Xpress & Mellow & Sleazy")).toEqual([
      "Tman Xpress",
      "Mellow & Sleazy",
    ]);
  });

  it("splits a four-way with mixed separators", () => {
    // Live Apple ZA: "Ruff, Emtee, Sjava & Saudi".
    expect(splitNames("Ruff, Emtee, Sjava & Saudi")).toEqual([
      "Ruff",
      "Emtee",
      "Sjava",
      "Saudi",
    ]);
  });

  it("falls back to the whole string for a short fragment (AC/DC)", () => {
    expect(splitNames("AC/DC")).toEqual(["AC/DC"]);
  });
});

// ── parseCredits — the 19 live cases ─────────────────────────────

describe("parseCredits", () => {
  beforeEach(() => {
    _resetAtomicArtists();
    registerAtomicArtists([
      "Earth, Wind & Fire",
      "Mellow & Sleazy",
      "Wisin & Yandel",
    ]);
  });

  it("Kabza De Small & DJ Maphorisa — Sponono (feat. Wizkid, Burna Boy, Cassper Nyovest)", () => {
    expectCredits(
      "Kabza De Small & DJ Maphorisa",
      "Sponono (feat. Wizkid, Burna Boy, Cassper Nyovest)",
      [
        ["Kabza De Small", "main"],
        ["DJ Maphorisa", "main"],
        ["Wizkid", "featured"],
        ["Burna Boy", "featured"],
        ["Cassper Nyovest", "featured"],
      ]
    );
  });

  it("Focalistic — Ke Star (Prod. by Vigro Deep)", () => {
    expectCredits("Focalistic", "Ke Star (Prod. by Vigro Deep)", [
      ["Focalistic", "main"],
      ["Vigro Deep", "producer"],
    ]);
  });

  it("Uncle Waffles — Tanzania (Da Capo Remix)", () => {
    expectCredits("Uncle Waffles", "Tanzania (Da Capo Remix)", [
      ["Uncle Waffles", "main"],
      ["Da Capo", "remixer"],
    ]);
  });

  it("Earth, Wind & Fire — September", () => {
    expectCredits("Earth, Wind & Fire", "September", [
      ["Earth, Wind & Fire", "main"],
    ]);
  });

  it("Mellow & Sleazy — Bopha (feat. DJ Maphorisa, Madumane) - Single", () => {
    expectCredits(
      "Mellow & Sleazy",
      "Bopha (feat. DJ Maphorisa, Madumane) - Single",
      [
        ["Mellow & Sleazy", "main"],
        ["DJ Maphorisa", "featured"],
        ["Madumane", "featured"],
      ]
    );
  });

  it("Tyla — Water (Official Music Video)", () => {
    expectCredits("Tyla", "Water (Official Music Video)", [["Tyla", "main"]]);
  });

  it("Burna Boy feat. Ed Sheeran — For My Hand", () => {
    expectCredits("Burna Boy feat. Ed Sheeran", "For My Hand", [
      ["Burna Boy", "main"],
      ["Ed Sheeran", "featured"],
    ]);
  });

  it("Major League DJz x Focalistic — Straata", () => {
    expectCredits("Major League DJz x Focalistic", "Straata", [
      ["Major League DJz", "main"],
      ["Focalistic", "main"],
    ]);
  });

  it("Asake — Lonely At The Top [Prod. Magicsticks]", () => {
    expectCredits("Asake", "Lonely At The Top [Prod. Magicsticks]", [
      ["Asake", "main"],
      ["Magicsticks", "producer"],
    ]);
  });

  it("Nasty C — Black And White ft. Ari Lennox (Deluxe)", () => {
    expectCredits("Nasty C", "Black And White ft. Ari Lennox (Deluxe)", [
      ["Nasty C", "main"],
      ["Ari Lennox", "featured"],
    ]);
  });

  it("Aymos — Emcimbini (Extended Mix)", () => {
    expectCredits("Aymos", "Emcimbini (Extended Mix)", [["Aymos", "main"]]);
  });

  it("Sun-El Musician — Ubomi Abumanga (feat. Msaki)", () => {
    expectCredits("Sun-El Musician", "Ubomi Abumanga (feat. Msaki)", [
      ["Sun-El Musician", "main"],
      ["Msaki", "featured"],
    ]);
  });

  it("Davido — Unavailable (with Musa Keys)", () => {
    expectCredits("Davido", "Unavailable (with Musa Keys)", [
      ["Davido", "main"],
      ["Musa Keys", "featured"],
    ]);
  });

  it("Wisin & Yandel — Rakata", () => {
    expectCredits("Wisin & Yandel", "Rakata", [["Wisin & Yandel", "main"]]);
  });

  it("Tems — Free Mind - Remastered 2023", () => {
    expectCredits("Tems", "Free Mind - Remastered 2023", [["Tems", "main"]]);
  });

  it("Tman Xpress & Mellow & Sleazy — MIDNIGHT IN DIEPKLOOF ZONE 2", () => {
    expectCredits(
      "Tman Xpress & Mellow & Sleazy",
      "MIDNIGHT IN DIEPKLOOF ZONE 2",
      [
        ["Tman Xpress", "main"],
        ["Mellow & Sleazy", "main"],
      ]
    );
  });

  it("Ruff, Emtee, Sjava & Saudi — The Trap Temptations", () => {
    expectCredits("Ruff, Emtee, Sjava & Saudi", "The Trap Temptations", [
      ["Ruff", "main"],
      ["Emtee", "main"],
      ["Sjava", "main"],
      ["Saudi", "main"],
    ]);
  });

  it("Drake — Take Care (Deluxe Version)", () => {
    expectCredits("Drake", "Take Care (Deluxe Version)", [["Drake", "main"]]);
  });

  it("Inkos'yamagcokama — TRUE COLOURS", () => {
    expectCredits("Inkos'yamagcokama", "TRUE COLOURS", [
      ["Inkos'yamagcokama", "main"],
    ]);
  });

  it("strips credit fragments from the title for dedupe", () => {
    const { cleanTitle } = parseCredits(
      "Focalistic",
      "Ke Star (Prod. by Vigro Deep)"
    );
    expect(cleanTitle).toBe("Ke Star");
  });
});

// ── mergeCredits / creditsFromDeezer ─────────────────────────────

describe("mergeCredits", () => {
  it("keeps the higher-ranked source on conflict, preserves distinct roles", () => {
    const title = parseCredits("Kabza De Small", "Sponono").credits;
    const deezer = creditsFromDeezer([
      { name: "Kabza De Small", role: "main" },
      { name: "Wizkid", role: "featuring" },
    ]);
    const merged = mergeCredits(title, deezer);
    const kabza = merged.find((c) => c.slug === "kabza-de-small")!;
    expect(kabza.source).toBe("deezer"); // deezer outranks title
    expect(merged.some((c) => c.slug === "wizkid")).toBe(true);
  });

  it("creditsFromDeezer maps 'featuring' to featured", () => {
    const out = creditsFromDeezer([{ name: "Wizkid", role: "featuring" }]);
    expect(out[0].role).toBe("featured");
    expect(out[0].source).toBe("deezer");
  });
});

// ── buildCreditGraph / topPeople ─────────────────────────────────

describe("buildCreditGraph", () => {
  it("indexes people, roles, collaborators and latest", () => {
    const graph = buildCreditGraph([
      release("Kabza De Small & DJ Maphorisa", "Sponono (feat. Wizkid)"),
      release("Kabza De Small", "Asibe Happy (feat. Young Stunna)", "2026-08-16"),
    ]);
    const kabza = graph.people.get("kabza-de-small")!;
    expect(kabza.count).toBe(2);
    expect(kabza.roles.main).toHaveLength(2);
    expect([...kabza.collaborators].sort()).toEqual([
      "dj-maphorisa",
      "wizkid",
      "young-stunna",
    ]);
    expect(kabza.latest).toBe("2026-08-16");
  });

  it("ranks producers first via topPeople", () => {
    const graph = buildCreditGraph([
      release("Focalistic", "Ke Star (Prod. by Vigro Deep)"),
      release("Kabza De Small & DJ Maphorisa", "Sponono (feat. Wizkid)"),
      release("Uncle Waffles", "Tanzania (Da Capo Remix)"),
    ]);
    const top = topPeople(graph, { limit: 5 }).map((p) => p.slug);
    // Vigro Deep has a single producer credit (weight 3), which outweighs the
    // remixer (2), featured (1.5) and main (1) credits below it.
    expect(top[0]).toBe("vigro-deep");
    expect(top[1]).toBe("da-capo");
    expect(top[2]).toBe("wizkid");
    // The remaining main-credit artists tie at weight 1; all are present.
    expect(top).toContain("kabza-de-small");
    expect(top).toContain("focalistic");
  });

  it("filters topPeople by role", () => {
    const graph = buildCreditGraph([
      release("Focalistic", "Ke Star (Prod. by Vigro Deep)"),
      release("Kabza De Small", "Sponono"),
    ]);
    const producers = topPeople(graph, { role: "producer" });
    expect(producers.map((p) => p.slug)).toEqual(["vigro-deep"]);
  });
});


