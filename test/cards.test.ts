import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { renderCrateCard, normalizeCrate, CRATE_CARD_SIZE } from "@/lib/cards/crate-card";
import { renderTitleCard, normalizeTitle, TITLE_CARD_SIZE } from "@/lib/cards/title-card";
import { keepDrawable, renderSvg } from "@/lib/cards/render";
import { fontCodePoints, fontTables } from "@/lib/cards/glyphs";
import { FONT_FILES } from "@/lib/cards/fonts";
import { CARD_LIMITS, cardFilename, clip, recordCount, tidy } from "@/lib/cards/text";
import { CARD_ACCENTS, cardAccent } from "@/lib/cards/theme";
import { jcardAccent } from "@/components/Artwork";
import nextConfig from "@/next.config";

/**
 * The Satori asset layer: cards render at their stated size whatever a crate
 * holds, text the fonts can't draw degrades instead of crashing, and the route
 * refuses what the client would never send.
 */

const svgSize = (svg: string) => {
  const m = svg.match(/^<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"[^>]*\bviewBox="0 0 (\d+) (\d+)"/);
  return m ? m.slice(1).map(Number) : null;
};

const RECORDS = Array.from({ length: 8 }, (_, i) => ({ title: `Record ${i + 1}`, artist: `Artist ${i + 1}` }));

describe("crate share card", () => {
  it("renders a 1080×1350 SVG", async () => {
    const svg = await renderCrateCard({ name: "Late Night Tapes", records: RECORDS });
    expect(svgSize(svg)).toEqual([1080, 1350, 1080, 1350]);
    expect(CRATE_CARD_SIZE).toEqual({ width: 1080, height: 1350 });
  }, 20_000);

  it("survives absurd titles, names and unbroken strings", async () => {
    const long = "Endless ".repeat(60);
    const unbroken = "A".repeat(400);
    const svg = await renderCrateCard({
      name: unbroken,
      records: [
        { title: long, artist: long },
        { title: unbroken, artist: unbroken },
        { title: "", artist: "" },
      ],
    });
    expect(svgSize(svg)).toEqual([1080, 1350, 1080, 1350]);
  }, 20_000);

  it("draws scripts the bundled fonts lack without throwing, and never writes text as markup", async () => {
    const svg = await renderCrateCard({
      name: "<script>alert(1)</script> 夜",
      records: [
        { title: "夜に駆ける", artist: "YOASOBI" },
        { title: "Группа крови", artist: "Кино" },
        { title: "Midnight 🌙 Drive ❤️", artist: "مرحبا" },
      ],
    });
    expect(svgSize(svg)).toEqual([1080, 1350, 1080, 1350]);
    // Glyphs are embedded as outlines: no caller string survives as text.
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("alert(1)");
    expect(svg).not.toContain("<text");
  }, 20_000);

  it("draws an empty crate", async () => {
    const svg = await renderCrateCard({ name: "Nothing yet", records: [] });
    expect(svgSize(svg)).toEqual([1080, 1350, 1080, 1350]);
  }, 20_000);

  it("normalises: at most 8 records, the real total kept, every field bounded", () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ title: "T".repeat(500), artist: `A${i}` }));
    const card = normalizeCrate({ name: "  Late\n\tNight  ", records: many });
    expect(card.records).toHaveLength(CARD_LIMITS.records);
    expect(card.total).toBe(23);
    expect(card.name).toBe("Late Night");
    expect(card.records[0].title.length).toBeLessThanOrEqual(CARD_LIMITS.title);
    expect(card.records[0].title.endsWith("…")).toBe(true);
    // An explicit total larger than the list wins; a smaller one doesn't.
    expect(normalizeCrate({ name: "x", records: RECORDS, total: 40 }).total).toBe(40);
    expect(normalizeCrate({ name: "x", records: RECORDS, total: 2 }).total).toBe(8);
    expect(normalizeCrate({ name: "   ", records: [{ title: "", artist: "" }] })).toEqual({
      name: "Crate",
      records: [{ title: "Untitled", artist: "" }],
      total: 1,
    });
  });
});

describe("release title card", () => {
  it("renders a 1920×1080 SVG for both variants", async () => {
    for (const variant of ["intro", "outro"] as const) {
      const svg = await renderTitleCard({ title: "Untrue", artist: "Burial", meta: "2007 · Hyperdub", variant });
      expect(svgSize(svg)).toEqual([1920, 1080, 1920, 1080]);
    }
    expect(TITLE_CARD_SIZE).toEqual({ width: 1920, height: 1080 });
  }, 20_000);

  it("defaults the eyebrow by variant and keeps a custom one short", () => {
    expect(normalizeTitle({ title: "a", artist: "b" }).eyebrow).toBe("NEW RELEASE");
    expect(normalizeTitle({ title: "a", artist: "b", variant: "outro" }).eyebrow).toBe("OUT NOW");
    expect(normalizeTitle({ title: "a", artist: "b", eyebrow: "x".repeat(99) }).eyebrow.length).toBe(CARD_LIMITS.eyebrow);
  });
});

describe("renderSvg glyph fallback", () => {
  const node = (text: string) =>
    createElement("div", { style: { display: "flex", width: 400, height: 100, fontSize: 32 } }, text);

  it("renders once, untouched, when every glyph is covered", async () => {
    const drawn: string[] = [];
    await renderSvg(
      (fix) => {
        drawn.push(fix("Группа крови · Ελλάδα · Tiếng Việt"));
        return node(drawn[drawn.length - 1]);
      },
      { width: 400, height: 100 },
    );
    expect(drawn).toEqual(["Группа крови · Ελλάδα · Tiếng Việt"]);
  }, 20_000);

  it("drops only the characters no font has, and dashes a string left empty", async () => {
    const drawn: string[][] = [];
    await renderSvg(
      (fix) => {
        const pass = [fix("Sakura 桜 Mix"), fix("夜に駆ける"), fix("Moon 🌙"), fix("")];
        drawn.push(pass);
        return node(pass.join(" "));
      },
      { width: 400, height: 100 },
    );
    expect(drawn).toHaveLength(2);
    expect(drawn[0]).toEqual(["Sakura 桜 Mix", "夜に駆ける", "Moon 🌙", ""]);
    expect(drawn[1]).toEqual(["Sakura Mix", "—", "Moon", ""]);
  }, 20_000);

  it("catches clusters Satori never reports: keycaps, combining marks, emoji sequences", async () => {
    const drawn: string[][] = [];
    await renderSvg(
      (fix) => {
        const pass = [
          fix("Number 1️⃣ Hit"),
          fix("#️⃣ Hashtag"),
          fix("e̲cho"),
          fix("\u{1F468}‍\u{1F469}‍\u{1F467} Family"),
          // A combining accent the fonts DO have stays on its letter.
          fix("Café"),
        ];
        drawn.push(pass);
        return node(pass.join(" "));
      },
      { width: 400, height: 100 },
    );
    expect(drawn).toHaveLength(2);
    expect(drawn[1]).toEqual(["Number 1 Hit", "# Hashtag", "echo", "Family", "Café"]);
  }, 20_000);
});

describe("glyph coverage", () => {
  const woff = readFileSync(path.join(process.cwd(), FONT_FILES[0].file));
  const cps = (s: string) => new Set(Array.from(s, (c) => c.codePointAt(0)!));

  it("reads a WOFF cmap: what the face draws, not what it doesn't", () => {
    const points = fontCodePoints(woff);
    for (const c of "AZaz09#…—") expect(points.has(c.codePointAt(0)!)).toBe(true);
    for (const cp of [0x3042, 0x1f319, 0xfe0f, 0x20e3, 0x0332]) expect(points.has(cp)).toBe(false);
  });

  it("reads the same cmap from a plain TrueType file, and refuses WOFF2 loudly", () => {
    const cmap = fontTables(woff).get("cmap")!;
    // The smallest sfnt there is: a header and one table record, for cmap.
    const ttf = Buffer.alloc(28 + cmap.length);
    ttf.writeUInt32BE(0x00010000, 0);
    ttf.writeUInt16BE(1, 4);
    ttf.write("cmap", 12, "latin1");
    ttf.writeUInt32BE(28, 20);
    ttf.writeUInt32BE(cmap.length, 24);
    cmap.copy(ttf, 28);
    expect(fontCodePoints(ttf)).toEqual(fontCodePoints(woff));
    const woff2 = readFileSync(path.join(process.cwd(), FONT_FILES[0].file.replace(/\.woff$/, ".woff2")));
    expect(() => fontCodePoints(woff2)).toThrow(/WOFF2/);
  });

  it("keeps a drawable base and its drawable marks, drops a cluster whose base isn't", () => {
    const points = cps("abceE ABĆɐ");
    expect(keepDrawable("e̲", points)).toBe("e");
    expect(keepDrawable("é", points)).toBe("é");
    expect(keepDrawable("桜́ abc", points)).toBe(" abc");
    // ɐ is in the set but its capital Ɐ isn't, and Satori uppercases first.
    expect(keepDrawable("ɐbc", points)).toBe("bc");
  });
});

describe("card text helpers", () => {
  it("tidy strips controls and bidi overrides, collapses whitespace", () => {
    expect(tidy("  a\u0000b\u202Ec\n\n d ")).toBe("a b c d");
    expect(tidy(42)).toBe("");
  });

  it("clip stays within the UTF-16 limit and never splits a surrogate pair", () => {
    expect(clip("short", 10)).toBe("short");
    const cut = clip("a".repeat(200), 120);
    expect(cut).toHaveLength(120);
    expect(cut.endsWith("…")).toBe(true);
    // An emoji straddling the cut is dropped whole, not halved.
    const emoji = clip(`${"a".repeat(8)}😀😀`, 10);
    expect(emoji.length).toBeLessThanOrEqual(10);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji)).toBe(false);
  });

  it("formats the count and the filename", () => {
    expect(recordCount(0)).toBe("EMPTY CRATE");
    expect(recordCount(1)).toBe("1 RECORD");
    expect(recordCount(12)).toBe("12 RECORDS");
    expect(cardFilename("Late Night / Tapes!")).toBe("late-night-tapes-pulsar.png");
    expect(cardFilename("Кино 夜")).toBe("кино-夜-pulsar.png");
    expect(cardFilename("!!!")).toBe("crate-pulsar.png");
  });

  it("gives a record the same stripe colour it has in the app", () => {
    for (const artist of ["Burial", "Aphex Twin", "Кино", "YOASOBI", "", "The Avalanches"]) {
      expect(cardAccent(artist)).toBe(jcardAccent(artist.toLowerCase()));
    }
  });

  it("draws that colour even when the artist's name can't be drawn", async () => {
    // Each undrawable artist is paired with a Latin one the app stripes the
    // same: the two cards then differ only in uncoloured label text, so their
    // accent fills must match exactly. Hashing the dashed name made them all
    // sport yellow.
    const fills = (svg: string) => CARD_ACCENTS.map((c) => svg.split(`fill="${c}"`).length - 1);
    const latin = ["Burial", "Aphex Twin", "Four Tet", "Bonobo", "Caribou", "Kelela", "Sade", "Floating Points"];
    for (const artist of ["米津玄師", "椎名林檎", "فيروز"]) {
      const twin = latin.find((a) => jcardAccent(a.toLowerCase()) === jcardAccent(artist.toLowerCase()));
      expect(twin, artist).toBeDefined();
      const crate = async (a: string) => fills(await renderCrateCard({ name: "x", records: [{ title: "Lemon", artist: a }] }));
      const title = async (a: string) => fills(await renderTitleCard({ title: "Lemon", artist: a }));
      expect(await crate(artist)).toEqual(await crate(twin!));
      expect(await title(artist)).toEqual(await title(twin!));
    }
  }, 30_000);
});

describe("card fonts ship with the function", () => {
  it("every face exists and is a WOFF (Satori can't read WOFF2)", () => {
    for (const { file } of FONT_FILES) {
      expect(file.endsWith(".woff")).toBe(true);
      expect(existsSync(path.join(process.cwd(), file))).toBe(true);
    }
  });

  it("every face is matched by next.config's outputFileTracingIncludes for /api/card", () => {
    const globs = nextConfig.outputFileTracingIncludes?.["/api/card"] ?? [];
    const toRe = (g: string) =>
      new RegExp(`^${g.replace(/^\.\//, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
    for (const { file } of FONT_FILES) {
      expect(globs.some((g) => toRe(g).test(file))).toBe(true);
    }
  });
});

describe("crate records for the share card", () => {
  beforeEach(() => vi.resetModules());

  const rel = (title: string) => ({ title, artist: "x" });

  it("finds favourites by name and a crate by name, preferring the matching count", async () => {
    vi.doMock("@/lib/collection", () => ({
      getFavorites: () => [rel("fav")],
      getCrates: () => [
        { id: "a", name: "Dupe", releases: [rel("one")] },
        { id: "b", name: "Dupe", releases: [rel("two"), rel("three")] },
        { id: "c", name: "Other", releases: [rel("o")] },
      ],
    }));
    const { crateRecordsFromStorage } = await import("@/lib/cards/client");
    expect(crateRecordsFromStorage("PULSAR Favorites", 1)?.map((r) => r.title)).toEqual(["fav"]);
    expect(crateRecordsFromStorage("Dupe", 2)?.map((r) => r.title)).toEqual(["two", "three"]);
    // A count matching neither leaves two different crates: no guessing.
    expect(() => crateRecordsFromStorage("Dupe", 9)).toThrow(expect.objectContaining({ name: "CardError" }));
    expect(crateRecordsFromStorage("Other", 9)?.map((r) => r.title)).toEqual(["o"]);
    expect(crateRecordsFromStorage("PULSAR Crate", 1)?.map((r) => r.title)).toEqual(["one"]);
    expect(crateRecordsFromStorage("Missing", 1)).toBeNull();
    vi.doUnmock("@/lib/collection");
  });

  it("refuses two same-named crates of the same size — the dock's own 'Crate N' naming makes them", async () => {
    // [My Crate, Crate 2, Crate 3] → delete Crate 2 → + makes another "Crate 3".
    vi.doMock("@/lib/collection", () => ({
      getFavorites: () => [],
      getCrates: () => [
        { id: "a", name: "Crate 3", releases: [rel("First crate record")] },
        { id: "b", name: "Crate 3", releases: [rel("Second crate record")] },
        { id: "c", name: "Twins", releases: [rel("same")] },
        { id: "d", name: "Twins", releases: [rel("same")] },
      ],
    }));
    const { crateRecordsFromStorage } = await import("@/lib/cards/client");
    expect(() => crateRecordsFromStorage("Crate 3", 1)).toThrow(/rename one/);
    // Identical cards either way: nothing to get wrong, so no refusal.
    expect(crateRecordsFromStorage("Twins", 1)?.map((r) => r.title)).toEqual(["same"]);
    vi.doUnmock("@/lib/collection");
  });

  it("builds a request the route accepts, however big the crate", async () => {
    const { crateCardRequest } = await import("@/lib/cards/client");
    const { cardBody } = await import("@/lib/cards/schema");
    const crate = Array.from({ length: 30 }, (_, i) => ({
      title: `${"Ω".repeat(150)} ${i}`,
      clean_title: i === 0 ? "Clean" : undefined,
      artist: "😀".repeat(100),
    }));
    const body = crateCardRequest("N".repeat(300), crate);
    expect(body.records).toHaveLength(8);
    expect(body.total).toBe(30);
    expect(body.records[0].title).toBe("Clean");
    expect(cardBody.safeParse(body).success).toBe(true);
  });
});

describe("closing the sheet cancels the card", () => {
  const created = vi.fn(() => "blob:card");
  beforeEach(() => {
    created.mockClear();
    // jsdom has no blob URLs; both rasterising and downloading start with one,
    // so "never called" means the card was neither drawn nor handed over.
    Object.defineProperty(URL, "createObjectURL", { value: created, configurable: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  const crate = [{ title: "t", artist: "a" }];

  it("hands nothing over when the sheet closed while the server was drawing", async () => {
    const { shareCrateCard } = await import("@/lib/cards/client");
    const ctl = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        ctl.abort();
        return new Response("<svg/>", { status: 200 });
      }),
    );
    await expect(shareCrateCard("Road Trip", crate, ctl.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(created).not.toHaveBeenCalled();
  });

  it("reports an aborted request as a cancellation, not a connection failure", async () => {
    const { shareCrateCard } = await import("@/lib/cards/client");
    const ctl = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
          ),
      ),
    );
    const pending = shareCrateCard("Road Trip", crate, ctl.signal);
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(created).not.toHaveBeenCalled();
  });
});

describe("ExportSheet share card key", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/cards/client");
    vi.resetModules();
  });

  /** A card that draws until the test says otherwise, recording the signal it was given. */
  async function mountWithPendingCard() {
    let signal: AbortSignal | undefined;
    let finish: (v: "downloaded") => void = () => {};
    vi.resetModules();
    vi.doMock("@/lib/cards/client", () => ({
      CardError: class extends Error {},
      crateRecordsFromStorage: () => null,
      shareCrateCard: (_n: string, _r: unknown, s: AbortSignal) => {
        signal = s;
        return new Promise((resolve) => (finish = resolve));
      },
    }));
    const { ExportSheet } = await import("@/components/ExportSheet");
    const view = render(
      createElement(ExportSheet, {
        count: 1,
        crateName: "Road Trip",
        cfgTick: 0,
        onPick: () => {},
        onCopy: () => {},
        onCsv: () => {},
        onCopyRedirect: () => {},
        records: [{ title: "t", artist: "a" }],
      }),
    );
    const key = screen.getByRole("button", { name: /share card/i });
    return { view, key, signal: () => signal, finish: (v: "downloaded") => finish(v) };
  }

  it("keeps focus on the key while it draws and after", async () => {
    const { key, signal, finish } = await mountWithPendingCard();
    key.focus();
    await act(async () => fireEvent.click(key));
    expect(signal()).toBeDefined();
    const busy = screen.getByRole("button", { name: /drawing card/i });
    // aria-disabled, not disabled: a disabled key would have dropped focus to <body>.
    expect(busy).not.toHaveAttribute("disabled");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(busy);
    await act(async () => finish("downloaded"));
    expect(await screen.findByText("Card saved as a PNG.")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /share card/i }));
  });

  it("cancels a card still drawing when the sheet goes away", async () => {
    const { view, key, signal } = await mountWithPendingCard();
    await act(async () => fireEvent.click(key));
    expect(signal()?.aborted).toBe(false);
    view.unmount();
    expect(signal()?.aborted).toBe(true);
  });
});

describe("POST /api/card", () => {
  beforeEach(() => vi.resetModules()); // fresh rate-limit buckets

  let ip = 0;
  const post = (body: unknown, contentType = "application/json") =>
    new NextRequest("https://pulsar.example/api/card", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": contentType, "x-forwarded-for": `198.51.100.${++ip}` },
    });

  it("returns an SVG with no-store caching for a valid crate", async () => {
    const { POST } = await import("@/app/api/card/route");
    const res = await POST(post({ kind: "crate", name: "Road Trip", records: RECORDS.slice(0, 3), total: 12 }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(svgSize(await res.text())).toEqual([1080, 1350, 1080, 1350]);
  }, 20_000);

  it("renders a title card", async () => {
    const { POST } = await import("@/app/api/card/route");
    const res = await POST(post({ kind: "title", title: "Untrue", artist: "Burial", variant: "outro" }));
    expect(res.status).toBe(200);
    expect(svgSize(await res.text())).toEqual([1920, 1080, 1920, 1080]);
  }, 20_000);

  it.each([
    ["an unknown kind", { kind: "poster", name: "x", records: [] }],
    ["a missing name", { kind: "crate", records: [] }],
    ["a blank name", { kind: "crate", name: "   ", records: [] }],
    ["a name over 80", { kind: "crate", name: "n".repeat(81), records: [] }],
    ["a title over 120", { kind: "crate", name: "x", records: [{ title: "t".repeat(121), artist: "a" }] }],
    ["an artist over 120", { kind: "crate", name: "x", records: [{ title: "t", artist: "a".repeat(121) }] }],
    ["nine records", { kind: "crate", name: "x", records: Array.from({ length: 9 }, () => ({ title: "t", artist: "a" })) }],
    ["a non-string title", { kind: "crate", name: "x", records: [{ title: 5, artist: "a" }] }],
    ["a fractional total", { kind: "crate", name: "x", records: [], total: 1.5 }],
  ])("400s on %s", async (_label, body) => {
    const { POST } = await import("@/app/api/card/route");
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("400s on malformed JSON, 415s on a non-JSON body, 413s on an oversized one", async () => {
    const { POST } = await import("@/app/api/card/route");
    expect((await POST(post("{nope"))).status).toBe(400);
    expect((await POST(post({ kind: "crate", name: "x", records: [] }, "text/plain"))).status).toBe(415);
    expect((await POST(post({ kind: "crate", name: "x", records: [], pad: "p".repeat(20_000) }))).status).toBe(413);
  });
});
