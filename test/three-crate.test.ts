import { describe, it, expect } from "vitest";
import {
  CRATE,
  DECK_PALETTE,
  FLOOR_Y,
  RECORD_SIZE,
  SPAWN_Y,
  STACK_YAW,
  buildRecordSpecs,
  crateInterior,
  groupByKind,
  hashString,
  isHouseRecord,
  kindForType,
  paletteFor,
  readCrateReleases,
  releaseTime,
  restLayout,
  spawnLayout,
  type CrateRelease,
} from "@/lib/three/crate-dig";

const rel = (i: number, type = "album"): CrateRelease => ({
  id: `r${i}`,
  artist: `Artist ${i}`,
  title: `Title ${i}`,
  type,
});

describe("readCrateReleases", () => {
  it("flattens crates and drops a release saved twice", () => {
    const raw = JSON.stringify([
      { id: "a", name: "A", releases: [rel(1), rel(2)] },
      { id: "b", name: "B", releases: [rel(2), rel(3, "single")] },
    ]);
    expect(readCrateReleases(raw).map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("never throws on junk", () => {
    expect(readCrateReleases(null)).toEqual([]);
    expect(readCrateReleases("{not json")).toEqual([]);
    expect(readCrateReleases(JSON.stringify({ releases: [] }))).toEqual([]);
    expect(readCrateReleases(JSON.stringify([null, { releases: "x" }, { releases: [{ id: 3 }] }]))).toEqual([]);
  });
});

describe("palette + kind mapping", () => {
  const inks = Object.values(DECK_PALETTE);

  it("gives every release a deck ink, the same one every time", () => {
    for (const id of ["a", "spotify:123", "r42", ""]) {
      expect(inks).toContain(paletteFor(id));
      expect(paletteFor(id)).toBe(paletteFor(id));
    }
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });

  it("spreads releases across the inks", () => {
    const used = new Set(Array.from({ length: 60 }, (_, i) => paletteFor(`release-${i}`)));
    expect(used.size).toBeGreaterThanOrEqual(5);
  });

  it("albums are sleeves, singles 7-inches, EPs tapes", () => {
    expect(kindForType("album")).toBe("lp");
    expect(kindForType("single")).toBe("single");
    expect(kindForType("ep")).toBe("tape");
    expect(kindForType(undefined)).toBe("lp");
  });
});

describe("buildRecordSpecs", () => {
  it("pads an empty crate to the minimum with house records", () => {
    const specs = buildRecordSpecs([]);
    expect(specs).toHaveLength(12);
    expect(new Set(specs.map((s) => s.kind))).toEqual(new Set(["lp", "single", "tape"]));
    expect(specs[6].label).toBe("LP 07");
  });

  it("uses the visitor's releases first and caps at the maximum", () => {
    const specs = buildRecordSpecs(Array.from({ length: 40 }, (_, i) => rel(i, i % 3 ? "album" : "ep")));
    expect(specs).toHaveLength(24);
    expect(specs[0]).toMatchObject({ id: "r0", kind: "tape", label: "Artist 0 — Title 0" });
    expect(specs[1].kind).toBe("lp");
  });

  it("groups spec indices by kind in crate order", () => {
    const specs = buildRecordSpecs([rel(0, "single"), rel(1), rel(2, "ep"), rel(3)], { min: 4 });
    expect(groupByKind(specs)).toEqual({ lp: [1, 3], single: [0], tape: [2] });
  });

  it("tells the visitor's records from the house padding", () => {
    const specs = buildRecordSpecs([rel(0), rel(1, "single")]);
    expect(specs.filter((s) => !isHouseRecord(s)).map((s) => s.label)).toEqual([
      "Artist 0 — Title 0",
      "Artist 1 — Title 1",
    ]);
    expect(specs.slice(2).every(isHouseRecord)).toBe(true);
  });
});

describe("spawnLayout", () => {
  const specs = buildRecordSpecs([], { min: 24, max: 24 });
  const spawn = spawnLayout(specs);

  it("holds every record above the frame, each higher than the last (no overlaps)", () => {
    spawn.forEach((p, i) => {
      expect(p.position[1]).toBeGreaterThanOrEqual(SPAWN_Y);
      if (i) expect(p.position[1] - spawn[i - 1].position[1]).toBeGreaterThan(RECORD_SIZE.lp[0] * 0.5);
    });
  });

  it("aims sleeves inside the crate and lets the rest spill around it", () => {
    const { cx, cz, halfX, halfZ } = crateInterior();
    specs.forEach((s, i) => {
      const [x, , z] = spawn[i].position;
      if (s.kind === "lp") {
        expect(Math.abs(x - cx) + RECORD_SIZE.lp[0] / 2).toBeLessThan(halfX);
        expect(Math.abs(z - cz) + RECORD_SIZE.lp[2] / 2).toBeLessThan(halfZ + 0.05);
      } else {
        expect(Math.abs(x - cx)).toBeLessThan(halfX + 0.6);
        expect(Math.abs(z - cz)).toBeLessThan(halfZ + 0.6);
      }
    });
  });

  it("is deterministic and releases as a cascade", () => {
    expect(spawnLayout(specs)).toEqual(spawn);
    expect(releaseTime(0)).toBe(0);
    expect(releaseTime(23)).toBeGreaterThan(1);
    expect(releaseTime(23)).toBeLessThan(2);
  });
});

describe("restLayout (reduced motion: already settled)", () => {
  const { cx, cz, halfX, halfZ, floorY } = crateInterior();

  /** Footprint half-width of a record lying flat, rotated by at most `yaw`. */
  const footprint = (w: number, d: number, yaw: number) =>
    (Math.max(w, d) / 2) * (Math.cos(yaw) + Math.sin(yaw));

  for (const [name, releases] of [
    ["empty crate", []],
    ["all albums", Array.from({ length: 24 }, (_, i) => rel(i))],
    ["all tapes", Array.from({ length: 24 }, (_, i) => rel(i, "ep"))],
    ["mixed", Array.from({ length: 18 }, (_, i) => rel(i, ["album", "single", "ep"][i % 3]))],
  ] as const) {
    it(`${name}: sleeves pile inside the crate without crossing its walls`, () => {
      const specs = buildRecordSpecs([...releases]);
      const rest = restLayout(specs);
      // positions already carry the pile jitter; this is the rotated half-extent
      const reach = footprint(RECORD_SIZE.lp[0], RECORD_SIZE.lp[2], STACK_YAW);
      specs.forEach((s, i) => {
        const [x, y, z] = rest[i].position;
        expect(y).toBeGreaterThan(FLOOR_Y);
        if (s.kind !== "lp") return;
        expect(Math.abs(x - cx) + reach).toBeLessThanOrEqual(halfX);
        expect(Math.abs(z - cz) + reach).toBeLessThanOrEqual(halfZ);
        expect(y - RECORD_SIZE.lp[1] / 2).toBeGreaterThanOrEqual(floorY - 1e-9);
        expect(y).toBeLessThan(CRATE.position[1] + CRATE.height); // the pile stays below the rim
      });
    });

    it(`${name}: floor records don't overlap each other or the crate`, () => {
      const specs = buildRecordSpecs([...releases]);
      const rest = restLayout(specs);
      const onFloor = specs
        .map((s, i) => ({ s, p: rest[i].position }))
        .filter(({ s, p }) => s.kind !== "lp" && Math.abs(p[1] - (FLOOR_Y + RECORD_SIZE[s.kind][1] / 2)) < 1e-9);
      const radius = (k: "single" | "tape" | "lp") => Math.hypot(RECORD_SIZE[k][0], RECORD_SIZE[k][2]) / 2;
      const single = RECORD_SIZE.single[0] / 2;
      for (let a = 0; a < onFloor.length; a++) {
        const ra = onFloor[a].s.kind === "single" ? single : radius(onFloor[a].s.kind);
        // outside the crate's footprint
        const [x, , z] = onFloor[a].p;
        const outside =
          Math.abs(x - cx) - ra >= CRATE.width / 2 || Math.abs(z - cz) - ra >= CRATE.depth / 2;
        expect(outside).toBe(true);
        for (let b = a + 1; b < onFloor.length; b++) {
          const rb = onFloor[b].s.kind === "single" ? single : radius(onFloor[b].s.kind);
          const d = Math.hypot(x - onFloor[b].p[0], z - onFloor[b].p[2]);
          expect(d).toBeGreaterThan(ra + rb);
        }
      }
    });
  }

  it("is deterministic", () => {
    const specs = buildRecordSpecs([]);
    expect(restLayout(specs)).toEqual(restLayout(specs));
  });
});
