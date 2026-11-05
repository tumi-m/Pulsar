import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARTIST_CHARS,
  LCD_CHARS,
  REDUCED_STEPS,
  RIVE_WASM,
  deckInputs,
  lcdCut,
  lcdText,
  type DeckSnapshot,
} from "@/components/RiveDeck";

const root = path.resolve(__dirname, "..");
const snap = (over: Partial<DeckSnapshot> = {}): DeckSnapshot => ({
  playing: false,
  loading: false,
  progress: 0,
  title: "Windowlicker",
  artist: "Aphex Twin",
  ...over,
});

describe("lcdText", () => {
  it("upper-cases and keeps what the segment font can draw", () => {
    expect(lcdText("Hounds of Love")).toBe("HOUNDS OF LOVE");
    expect(lcdText("Track 01 (Live) - Part 2/3")).toBe("TRACK 01 (LIVE) - PART 2/3");
  });

  it("folds accents and the letters NFKD leaves alone", () => {
    expect(lcdText("Sigur Rós")).toBe("SIGUR ROS");
    expect(lcdText("Beyoncé")).toBe("BEYONCE");
    expect(lcdText("Røyksopp")).toBe("ROYKSOPP");
    expect(lcdText("Straße")).toBe("STRASSE");
    expect(lcdText("Œuvre Ærø")).toBe("OEUVRE AERO");
  });

  it("maps typographic punctuation onto ASCII", () => {
    expect(lcdText("Don’t Stop — “Now”…")).toBe(`DON'T STOP - "NOW"...`);
  });

  it("drops scripts the font would draw as tofu, and collapses the gaps", () => {
    expect(lcdText("日本語")).toBe("");
    // Only the dash would survive; a lone dash reads as a glitch, so blank.
    expect(lcdText("Кино — Группа крови")).toBe("");
    expect(lcdText("ДДТ 2")).toBe("2");
    expect(lcdText("坂本龍一  Ryuichi   Sakamoto ")).toBe("RYUICHI SAKAMOTO");
  });
});

describe("deckInputs", () => {
  it("drives isPlaying from the player, but never while buffering", () => {
    expect(deckInputs(snap({ playing: true }), false).isPlaying).toBe(true);
    expect(deckInputs(snap({ playing: false }), false).isPlaying).toBe(false);
    expect(deckInputs(snap({ playing: true, loading: true }), false).isPlaying).toBe(false);
  });

  it("says LOADING on the glass while the preview buffers", () => {
    expect(deckInputs(snap({ loading: true }), false).track).toBe("LOADING".padEnd(LCD_CHARS));
  });

  it("maps 0..1 progress onto the file's 0..100, whole percent, clamped", () => {
    expect(deckInputs(snap({ progress: 0.426 }), false).trackProgress).toBe(43);
    expect(deckInputs(snap({ progress: 1.4 }), false).trackProgress).toBe(100);
    expect(deckInputs(snap({ progress: -0.2 }), false).trackProgress).toBe(0);
    expect(deckInputs(snap({ progress: Number.NaN }), false).trackProgress).toBe(0);
  });

  it("steps the line in coarse twentieths under reduced motion, so the deck can settle between steps", () => {
    // Whole-percent ticks arrive every 0.3s on a 30s preview, faster than
    // SETTLE_MS, so the state machine never paused while a preview played.
    const step = 100 / REDUCED_STEPS;
    expect(step).toBe(5);
    expect(deckInputs(snap({ progress: 0.426, playing: true }), true).trackProgress).toBe(45);
    expect(deckInputs(snap({ progress: 0.41, playing: true }), true).trackProgress).toBe(40);
    expect(deckInputs(snap({ progress: 1.4, playing: true }), true).trackProgress).toBe(100);
    expect(deckInputs(snap({ progress: Number.NaN }), true).trackProgress).toBe(0);
    // Over a 30s preview the reduced line moves at most once per 1.5s.
    const values = new Set<number>();
    for (let t = 0; t <= 30; t += 0.3) values.add(deckInputs(snap({ progress: t / 30, playing: true }), true).trackProgress);
    expect(values.size).toBeLessThanOrEqual(REDUCED_STEPS + 1);
  });

  it("pads short titles to the window so the marquee leaves them still", () => {
    const { track } = deckInputs(snap({ title: "Abc", playing: true }), false);
    expect(track).toHaveLength(LCD_CHARS);
    expect(track).toBe("ABC" + " ".repeat(LCD_CHARS - 3));
  });

  it("lets long titles scroll while playing, but cuts them under reduced motion", () => {
    const long = snap({ title: "A very long title that goes on", playing: true });
    expect(deckInputs(long, false).track).toBe("A VERY LONG TITLE THAT GOES ON");
    const still = deckInputs(long, true).track;
    expect(still).toHaveLength(LCD_CHARS);
    expect(still).toBe("A VERY LONG ");
  });

  it("cuts long titles whenever the deck holds still: paused or buffering", () => {
    // The state machine is paused then (SETTLE_MS), so a scrolling title would
    // freeze mid-pass; the cut makes the held frame read from the start.
    const long = { title: "A very long title that goes on" };
    expect(deckInputs(snap({ ...long, playing: false }), false).track).toBe("A VERY LONG ");
    expect(deckInputs(snap({ ...long, playing: true, loading: true }), false).track).toBe(
      "LOADING".padEnd(LCD_CHARS),
    );
  });

  it("cuts at the window mid-word, as a hardware LCD does", () => {
    expect(deckInputs(snap({ title: "Hounds of Love" }), true).track).toBe("HOUNDS OF LO");
  });

  it("passes the artist through the same folding, unpadded", () => {
    expect(deckInputs(snap({ artist: "Björk" }), false).artist).toBe("BJORK");
    expect(deckInputs(snap({ artist: "Kendrick Lamar" }), false).artist).toBe("KENDRICK LAMAR");
  });

  it("cuts a long artist to the row's cells, whether playing or not", () => {
    // Left to the file, the row wraps at a space and shows only its first line:
    // "THE VELVET", a different band.
    for (const [playing, reduced] of [[true, false], [false, false], [true, true]] as const) {
      const { artist } = deckInputs(
        snap({ artist: "The Velvet Underground & Nico", playing }),
        reduced,
      );
      expect(artist).toBe("THE VELVET UNDE");
      expect(artist).toHaveLength(ARTIST_CHARS);
    }
  });

  it("never leaves a separator dangling at the artist's cut", () => {
    expect(deckInputs(snap({ artist: "Bob Marley & The Wailers" }), false).artist).toBe(
      "BOB MARLEY & TH",
    );
    expect(deckInputs(snap({ artist: "Crosby, Stills, Nash & Young" }), false).artist).toBe(
      "CROSBY, STILLS",
    );
    expect(deckInputs(snap({ artist: "Earth, Wind & Fire" }), false).artist).toBe("EARTH, WIND & F");
  });
});

describe("lcdCut", () => {
  it("leaves text that fits alone, separators and all", () => {
    expect(lcdCut("AC/DC", 12)).toBe("AC/DC");
    expect(lcdCut("ABCDEFGHIJKL", 12)).toBe("ABCDEFGHIJKL");
  });

  it("drops spaces and separators the cut leaves at the edge", () => {
    expect(lcdCut("SIMON & GARFUNKEL", 8)).toBe("SIMON");
    expect(lcdCut("TYLER, THE CREATOR", 6)).toBe("TYLER");
    expect(lcdCut("PRINCE AND THE (NPG)", 16)).toBe("PRINCE AND THE");
    expect(lcdCut("SOMEONE - SOMETHING", 10)).toBe("SOMEONE");
  });
});

describe("public/rive assets", () => {
  it("self-hosts the wasm the installed runtime expects", () => {
    // RuntimeLoader pairs its JS with this binary; a stale copy after an
    // upgrade fails at load, silently, because the deck is decorative.
    const pkg = JSON.parse(
      readFileSync(path.join(root, "node_modules/@rive-app/canvas/package.json"), "utf8"),
    ) as { version: string };
    expect(RIVE_WASM).toBe(`/rive/rive-${pkg.version}.wasm`);
    const served = path.join(root, "public", RIVE_WASM);
    expect(existsSync(served)).toBe(true);
    const installed = readFileSync(path.join(root, "node_modules/@rive-app/canvas/rive.wasm"));
    expect(readFileSync(served).equals(installed)).toBe(true);
  });

  it("ships the .riv the NOTICE describes, with its licences", () => {
    const riv = readFileSync(path.join(root, "public/rive/digital_music_player.riv"));
    const sha = createHash("sha256").update(riv).digest("hex");
    const notice = readFileSync(path.join(root, "public/rive/NOTICE.md"), "utf8");
    expect(notice).toContain(sha);
    expect(notice).toContain("MIT");
    expect(existsSync(path.join(root, "public/rive/OFL-DigitalNumbers.txt"))).toBe(true);
  });
});
