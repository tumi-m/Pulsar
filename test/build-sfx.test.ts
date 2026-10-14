import { describe, expect, it } from "vitest";
import {
  BED,
  SOUNDS,
  SR,
  containerDurationOk,
  decodedDurationOk,
  encodeWav,
  mulberry32,
  readWav24,
  synthBed,
  synthBedBody,
  synthDrop,
  synthError,
  synthKey,
  synthSuccess,
} from "../scripts/motion/build-sfx.mjs";

/**
 * The synthesis half of scripts/motion/build-sfx.mjs. The FFmpeg half (encode,
 * ffprobe, loudness) is checked by the script itself every time it runs.
 */

const peakDb = (buf: Float32Array) => 20 * Math.log10(buf.reduce((p, v) => Math.max(p, Math.abs(v)), 0));

describe("build-sfx synthesis", () => {
  it("draws the same numbers from the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it.each([
    ["key", synthKey, 0.07],
    ["drop", synthDrop, 0.18],
    ["success", synthSuccess, 0.6],
    ["error", synthError, 0.3],
  ] as const)("%s is deterministic, the right length, click-free and under the ceiling", (_, synth, seconds) => {
    const a = synth();
    const b = synth();
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBe(Math.round(seconds * SR));
    // Starts and ends on silence, so a speaker never jumps.
    expect(Math.abs(a[0])).toBe(0);
    expect(Math.abs(a[a.length - 1])).toBe(0);
    expect(peakDb(a)).toBeLessThanOrEqual(-3 + 1e-6);
    expect(peakDb(a)).toBeGreaterThan(-20);
  });

  it("matches the manifest the build checks against", () => {
    expect(SOUNDS[0].name).toBe("recap-bed"); // first: the recap video depends on it
    for (const s of SOUNDS.slice(1)) expect(s.maxBytes).toBeLessThanOrEqual(15 * 1024);
    expect(SOUNDS[0].maxBytes).toBeLessThanOrEqual(400 * 1024);
    // Whole bars, so the loop seam falls on a downbeat.
    expect((BED.bars * BED.beatsPerBar * 60) / BED.bpm).toBe(BED.seconds);
  });

  it(
    "renders the bed as a seamless loop with a gentle fade-in",
    () => {
      const [L, R] = synthBedBody();
      expect(L.length).toBe(BED.seconds * SR);
      expect(R.length).toBe(L.length);
      for (const ch of [L, R]) {
        // The step from the last sample to the first is no bigger than an
        // ordinary step inside the loop, i.e. there is no seam to hear.
        const steps: number[] = [];
        for (let i = 1; i < ch.length; i += 31) steps.push(Math.abs(ch[i] - ch[i - 1]));
        steps.sort((x, y) => x - y);
        const p999 = steps[Math.floor(steps.length * 0.999)];
        expect(Math.abs(ch[ch.length - 1] - ch[0])).toBeLessThan(p999);
      }

      const [fl] = synthBed();
      const rms = (a: Float32Array, from: number, to: number) => {
        let e = 0;
        for (let i = from; i < to; i++) e += a[i] * a[i];
        return Math.sqrt(e / (to - from));
      };
      expect(Math.abs(fl[0])).toBe(0);
      // The first 100 ms is far quieter than the same span once the fade is done.
      expect(rms(fl, 0, SR / 10)).toBeLessThan(rms(L, 0, SR / 10) * 0.05);
      // After the fade the shipped bed IS the loop body.
      const after = Math.round(BED.fadeInSeconds * SR) + 10;
      expect(fl[after]).toBe(L[after]);
    },
    60_000
  );
});

describe("build-sfx file helpers", () => {
  it("writes a 48 kHz float WAV header", () => {
    const wav = encodeWav([new Float32Array([0, 0.5, -0.5]), new Float32Array([0, 0.25, -0.25])]);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(20)).toBe(3); // IEEE float
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt32LE(40)).toBe(3 * 2 * 4);
    expect(wav.readFloatLE(44 + 8 * 1)).toBe(0.5);
    expect(wav.readFloatLE(44 + 8 * 1 + 4)).toBe(0.25);
  });

  it("reads duration and peak from a decoded 24-bit WAV, skipping unknown chunks", () => {
    const frames = 4800; // 0.1 s mono
    const list = Buffer.from("LIST\x04\x00\x00\x00abcd", "binary");
    const fmt = Buffer.alloc(24);
    fmt.write("fmt ", 0);
    fmt.writeUInt32LE(16, 4);
    fmt.writeUInt16LE(1, 8);
    fmt.writeUInt16LE(1, 10);
    fmt.writeUInt32LE(48000, 12);
    const data = Buffer.alloc(8 + frames * 3);
    data.write("data", 0);
    data.writeUInt32LE(frames * 3, 4);
    data.writeIntLE(Math.round(0.5 * 8388608), 8 + 100 * 3, 3); // one sample at -6 dBFS
    const head = Buffer.from("RIFF\x00\x00\x00\x00WAVE", "binary");
    const { seconds, peakDb: peak } = readWav24(Buffer.concat([head, fmt, list, data]));
    expect(seconds).toBeCloseTo(0.1, 6);
    expect(peak).toBeCloseTo(-6.02, 1);
  });

  it("allows codec framing on the container duration but nothing on what decodes", () => {
    const mp3Framing = (1105 + 1152) / 48000;
    expect(containerDurationOk(0.18, 0.216, mp3Framing)).toBe(true);
    expect(containerDurationOk(0.18, 0.17, mp3Framing)).toBe(false); // truncated
    expect(containerDurationOk(0.18, 0.3, mp3Framing)).toBe(false); // padded
    expect(decodedDurationOk(0.18, 0.18)).toBe(true);
    expect(decodedDurationOk(0.18, 0.192)).toBe(false);
  });
});
