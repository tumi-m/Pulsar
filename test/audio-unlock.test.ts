import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The iOS audio unlock primes the <audio> element by playing a silent clip
 * inside a user gesture. That only works if the clip contains real audio.
 *
 * The clip that shipped declared a `data` chunk of ZERO bytes — a valid WAV
 * header with no frames behind it. Chromium tolerates that; Safari, which this
 * unlock exists for, is stricter about undecodable media. It could not be
 * tested here (Chromium only), so it is treated as a defect to remove rather
 * than a proven cause.
 *
 * The certain bug was the control flow: the element was marked unlocked BEFORE
 * the play attempt, so any single failure disabled unlocking for the whole
 * session and no later gesture retried.
 *
 * These assert the clip is real, because nothing else would catch it: a base64
 * blob that looks fine and can only misbehave on a platform we cannot run.
 */

const SRC = readFileSync(
  join(__dirname, "..", "components", "player", "PlayerProvider.tsx"),
  "utf8"
);

function extractSilentWav(): Buffer {
  const m = SRC.match(/SILENT_WAV\s*=\s*\n?\s*"data:audio\/wav;base64,([A-Za-z0-9+/=]+)"/);
  if (!m) throw new Error("SILENT_WAV data URI not found in PlayerProvider");
  return Buffer.from(m[1], "base64");
}

describe("the silent unlock clip", () => {
  const wav = extractSilentWav();

  it("is a well-formed RIFF/WAVE file", () => {
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    // RIFF size counts everything after the first 8 bytes.
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
  });

  it("actually contains audio frames — the bug that broke iOS", () => {
    const dataIdx = wav.indexOf("data");
    expect(dataIdx).toBeGreaterThan(-1);
    const declared = wav.readUInt32LE(dataIdx + 4);
    const actual = wav.length - (dataIdx + 8);
    expect(declared).toBeGreaterThan(0);
    expect(actual).toBe(declared);
  });

  it("is silent, not just non-empty", () => {
    const dataIdx = wav.indexOf("data");
    const bits = wav.readUInt16LE(34);
    const frames = wav.subarray(dataIdx + 8);
    // 8-bit PCM is unsigned, so silence is 0x80; 16-bit is signed, silence 0.
    const silentByte = bits === 8 ? 0x80 : 0x00;
    expect(frames.every((b) => b === silentByte)).toBe(true);
  });

  it("stays small enough to inline without bloating the bundle", () => {
    expect(wav.length).toBeLessThan(4096);
  });
});

describe("unlock control flow", () => {
  it("only marks the element unlocked after a SUCCESSFUL play", () => {
    // The original set the flag before attempting, so a single failure
    // permanently disabled unlocking for the session.
    const fn = SRC.slice(SRC.indexOf("const unlockAudio"), SRC.indexOf("useEffect(() => {\n    const onGesture"));
    const thenIdx = fn.indexOf(".then(");
    const flagIdx = fn.indexOf("unlockedRef.current = true");
    expect(thenIdx).toBeGreaterThan(-1);
    expect(flagIdx).toBeGreaterThan(thenIdx);
  });

  it("listens in the capture phase so stopPropagation can't block it", () => {
    expect(SRC).toMatch(/capture:\s*true/);
  });
});

/**
 * The teardown race.
 *
 * Priming is asynchronous and play() assigns the real preview URL while that
 * promise is still pending. The teardown then ran unconditionally — pausing the
 * element and calling removeAttribute("src") — which DELETED the track that had
 * just been loaded. Playback failed for want of a source, the user was told to
 * tap play again, and every subsequent tap hit a source-less element whose
 * rejection went into an empty catch. Nothing happened, with no explanation.
 */
describe("priming teardown", () => {
  it("is guarded by a token, so it can't clear a source assigned since", () => {
    const fn = SRC.slice(SRC.indexOf("const unlockAudio"), SRC.indexOf("const toggle"));
    const guardIdx = fn.indexOf("primeTokenRef.current !== token");
    const clearIdx = fn.indexOf('removeAttribute("src")');
    expect(guardIdx, "expected a token guard before the teardown").toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(guardIdx);
  });

  it("no longer decides what to clear from a stale prevSrc snapshot", () => {
    // The original captured audio.src BEFORE priming and cleared based on it,
    // which said nothing about what the element held by the time it resolved.
    expect(SRC).not.toMatch(/const prevSrc = audio\.src/);
  });

  it("invalidates a pending prime whenever a real source is assigned", () => {
    // Both play() and playDirect() must bump the token.
    const bumps = SRC.match(/primeTokenRef\.current\+\+/g) ?? [];
    expect(bumps.length).toBeGreaterThanOrEqual(2);
  });
});

describe("toggle", () => {
  it("does not swallow a failed play", () => {
    const fn = SRC.slice(SRC.indexOf("const toggle = useCallback"));
    const body = fn.slice(0, fn.indexOf("}, [hasAudio"));
    // The shipped version was `audio.play().catch(() => {})` — a tap that
    // reported nothing at all.
    expect(body).not.toMatch(/play\(\)\.catch\(\(\) => \{\}\)/);
    expect(body).toMatch(/setError\(/);
  });

  it("primes before playing, since the tap is itself a user activation", () => {
    const fn = SRC.slice(SRC.indexOf("const toggle = useCallback"));
    const body = fn.slice(0, fn.indexOf("}, [hasAudio"));
    expect(body).toMatch(/unlockAudio\(\)/);
  });
});


/**
 * Diagnosability.
 *
 * "Playback was blocked" asserted a cause (the autoplay policy) that the code
 * had not established. The same branch is reached by a decode failure, a CORS
 * rejection or a dead URL — so three rounds of fixes were aimed at a guess.
 * The browser knows which it was; the UI must repeat it rather than invent one.
 */
describe("play failure reporting", () => {
  it("reads the browser's MediaError code rather than assuming a cause", () => {
    const fn = SRC.slice(SRC.indexOf("function describePlayFailure"));
    const body = fn.slice(0, fn.indexOf("\nconst Ctx"));
    // All four MediaError codes must be distinguished.
    for (const code of ["case 1:", "case 2:", "case 3:", "case 4:"]) {
      expect(body, `missing ${code}`).toContain(code);
    }
    expect(body).toContain("NotAllowedError");
  });

  it("no longer claims playback was blocked without evidence", () => {
    expect(SRC).not.toContain('setError("Playback was blocked")');
  });

  it("is used by every path that can fail a play", () => {
    // play(), toggle() and playDirect() must all report through it.
    const uses = SRC.match(/describePlayFailure\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(4); // definition + 3 call sites
  });
});
