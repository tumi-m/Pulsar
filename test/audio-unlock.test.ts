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
