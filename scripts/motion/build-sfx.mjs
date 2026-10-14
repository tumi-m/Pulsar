#!/usr/bin/env node
/**
 * Synthesises Pulsar's interface sounds and the Crate Recap music bed, then
 * encodes them with the FFmpeg that ships inside Remotion.
 *
 *   npm run motion:sfx
 *
 * Every sound is generated from code, not sampled: there is no licence to
 * track, the output is byte-for-byte reproducible (all "randomness" comes from
 * a seeded PRNG), and changing a sound is a reviewed diff rather than an
 * opaque binary swap.
 *
 * Pipeline per sound:
 *   1. synthesise 48 kHz float PCM in JS (48 kHz because Opus only runs at 48k,
 *      so nothing gets resampled on the way in)
 *   2. normalise (see LOUDNESS below)
 *   3. write a 32-bit float WAV to a temp dir
 *   4. encode to .webm (Opus) and .mp3 in public/sfx/ — Opus is smaller and
 *      better at these bitrates; mp3 is the fallback for Safari builds that
 *      can't decode Opus-in-WebM
 *   5. ffprobe every output and fail if anything is missing, mis-encoded,
 *      the wrong length, too loud or over budget
 *
 * LOUDNESS. The four UI sounds are peak-normalised in JS, not loudnorm'd:
 * EBU R128 integrated loudness is measured over 400 ms gating blocks, and a
 * 70 ms click is shorter than a single block, so loudnorm has nothing sound to
 * measure (it drops into dynamic mode and resamples to 192 kHz). A peak ceiling
 * is exact for transients. Each sound then gets a fixed trim below that ceiling
 * because a sustained chime carries far more energy per unit of peak than a
 * click does; the trims are what make the set sound even. They play at ~0.35
 * gain in the app, so the loudest lands around -12 dBFS — clearly under
 * mastered music (-1 dBTP peaks), which is the point: they acknowledge, they
 * don't compete.
 *
 * The bed is 24 s, long enough for R128 to mean something, so it is measured
 * with FFmpeg's loudnorm analyser and brought to -18 LUFS integrated with a
 * single linear gain (no dynamic processing), capped so true peak stays at or
 * under -3 dBTP. -18 LUFS sits ~4 LU under streaming-normalised music, so it
 * reads as a bed under the video rather than as the foreground; the -3 dBTP
 * headroom absorbs the inter-sample overshoot that lossy encoders add.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "public", "sfx");

export const SR = 48000;
const TAU = Math.PI * 2;

/* ── deterministic noise ─────────────────────────────────────────── */

/** mulberry32 — tiny, fast, and the same sequence on every machine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pink-ish noise (Paul Kellet's economy filter): warmer than white, so hiss
 *  and cardboard read as material rather than as static. */
function pinkSource(rand) {
  let b0 = 0, b1 = 0, b2 = 0;
  return () => {
    const w = rand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.2;
  };
}

/* ── filters (RBJ cookbook biquads) ──────────────────────────────── */

function biquad(type, f0, q = Math.SQRT1_2, gainDb = 0) {
  const w = (TAU * f0) / SR;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowpass") {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === "highpass") {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === "bandpass") {
    // constant 0 dB peak gain, so Q changes width without changing level
    b0 = alpha; b1 = 0; b2 = -alpha;
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else {
    const A = 10 ** (gainDb / 40);
    b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
  }
  const c0 = b0 / a0, c1 = b1 / a0, c2 = b2 / a0, d1 = a1 / a0, d2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = c0 * x + c1 * x1 + c2 * x2 - d1 * y1 - d2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function chain(...filters) {
  return (x) => {
    for (const f of filters) x = f(x);
    return x;
  };
}

function applyFilter(buf, f) {
  for (let i = 0; i < buf.length; i++) buf[i] = f(buf[i]);
  return buf;
}

/**
 * Filter a loop as if it had always been looping. One discarded pass over the
 * whole buffer leaves the filter in the state the loop's own tail would leave
 * it in, so the real pass starts exactly where the end left off — no
 * discontinuity at the seam from a filter starting cold.
 */
function applyFilterCircular(buf, f) {
  for (let i = 0; i < buf.length; i++) f(buf[i]);
  return applyFilter(buf, f);
}

/* ── helpers ─────────────────────────────────────────────────────── */

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const dbToGain = (db) => 10 ** (db / 20);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function peakOf(...bufs) {
  let p = 0;
  for (const b of bufs) for (let i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i]));
  return p;
}

function scale(gain, ...bufs) {
  for (const b of bufs) for (let i = 0; i < b.length; i++) b[i] *= gain;
}

/** Short raised-cosine fades at both ends so no sound starts or stops on a
 *  non-zero sample (which a speaker reproduces as a click). */
function edgeFades(buf, inMs = 0.6, outMs = 6) {
  const fi = Math.round((inMs / 1000) * SR);
  const fo = Math.round((outMs / 1000) * SR);
  for (let i = 0; i < fi; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
  for (let i = 0; i < fo; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  return buf;
}

/** Peak-normalise to `ceilingDb`, then apply the per-sound trim. */
function normalisePeak(buf, ceilingDb, trimDb) {
  const p = peakOf(buf);
  if (p > 0) scale(dbToGain(ceilingDb + trimDb) / p, buf);
  return buf;
}

/* ── the UI sounds ───────────────────────────────────────────────── */

const SFX_PEAK_DB = -3;

/**
 * key — a Walkman transport key going down. Two events, like the real thing:
 * the plastic key-top ticking against the chassis, then ~22 ms later the
 * mechanism latching. Band-limited to 7 kHz so it reads as plastic, not as a
 * digital click.
 */
export function synthKey() {
  const n = Math.round(0.07 * SR);
  const out = new Float32Array(n);
  const rand = mulberry32(0x6b6579);
  const tick = chain(biquad("bandpass", 3400, 1.4), biquad("lowpass", 7000));
  const latch = chain(biquad("bandpass", 1500, 2.2), biquad("lowpass", 6000));
  const latchAt = Math.round(0.022 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w = rand() * 2 - 1;
    // Tick: a 3 ms burst.
    let s = tick(w * Math.exp(-t / 0.0028));
    // Latch: lower and woodier, with a small chassis "body" under it.
    if (i >= latchAt) {
      const tl = (i - latchAt) / SR;
      const env = Math.exp(-tl / 0.007);
      s += latch(w * env) * 1.4;
      s += Math.sin(TAU * 210 * tl) * Math.exp(-tl / 0.012) * 0.22;
    } else {
      latch(0);
    }
    out[i] = s;
  }
  return normalisePeak(edgeFades(out, 0.4, 8), SFX_PEAK_DB, 0);
}

/**
 * drop — a record sleeve landing in a cardboard crate. A low thump that
 * settles in pitch (the crate floor), a boxy mid resonance (the cardboard
 * walls) and a short papery slap (the sleeve edge). No highs above ~3 kHz:
 * it should feel soft, like the add was received, not like an alert.
 */
export function synthDrop() {
  const n = Math.round(0.18 * SR);
  const out = new Float32Array(n);
  const rand = mulberry32(0x64726f70);
  const pink = pinkSource(rand);
  const box = chain(biquad("bandpass", 420, 1.6), biquad("lowpass", 2500));
  const slap = chain(biquad("bandpass", 1500, 1.1), biquad("lowpass", 3200));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const att = smooth(t / 0.003);
    const f = 62 + 58 * Math.exp(-t / 0.022);
    phase += (TAU * f) / SR;
    const thump = Math.sin(phase) * Math.exp(-t / 0.055) * att;
    const p = pink();
    const body = box(p * Math.exp(-t / 0.035) * att) * 3.2;
    const paper = slap(p * Math.exp(-t / 0.009) * att) * 1.1;
    out[i] = thump * 0.9 + body + paper;
  }
  return normalisePeak(edgeFades(out, 0.5, 30), SFX_PEAK_DB, -1);
}

/** A soft mallet tone: sine plus a little 2nd and 3rd partial that die first,
 *  which is what makes it read as struck rather than as a test tone. */
function mallet(out, startS, hz, amp, decayS, wowDepth = 0) {
  const start = Math.round(startS * SR);
  let p1 = 0;
  for (let i = start; i < out.length; i++) {
    const t = (i - start) / SR;
    const wow = 1 + wowDepth * Math.sin(TAU * 4.2 * t);
    p1 += (TAU * hz * wow) / SR;
    const env = smooth(t / 0.004) * Math.exp(-t / decayS);
    const s =
      Math.sin(p1) +
      0.18 * Math.sin(2 * p1) * Math.exp(-t / (decayS * 0.35)) +
      0.06 * Math.sin(3 * p1) * Math.exp(-t / (decayS * 0.2));
    out[i] += s * env * amp;
  }
}

/**
 * success — two notes rising a perfect fourth (E5 → A5). A fourth resolves
 * without the fanfare of a major arpeggio; it says "done", not "you win".
 * A touch of tape wow keeps it in the Walkman world.
 */
export function synthSuccess() {
  const n = Math.round(0.6 * SR);
  const out = new Float32Array(n);
  mallet(out, 0, midiHz(76), 0.8, 0.16, 0.0015);
  mallet(out, 0.11, midiHz(81), 1.0, 0.2, 0.0015);
  applyFilter(out, biquad("lowpass", 6500));
  // The tail must reach zero inside the 600 ms, not be chopped by it.
  return normalisePeak(edgeFades(out, 0.5, 120), SFX_PEAK_DB, -7);
}

/**
 * error — a low double blip, the second a semitone below the first. Low,
 * rounded and short, so a failed export is noticed without alarm: no
 * dissonant interval, nothing above the speech band. Middle C rather than
 * lower because phone speakers roll off below ~250 Hz and a lower blip
 * would arrive as little more than its own harmonics.
 */
export function synthError() {
  const n = Math.round(0.3 * SR);
  const out = new Float32Array(n);
  for (const [at, hz] of [
    [0, midiHz(60)],
    [0.13, midiHz(59)],
  ]) {
    const start = Math.round(at * SR);
    const len = Math.round(0.11 * SR);
    let ph = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR;
      ph += (TAU * hz) / SR;
      // Rounded on/off — a hard-gated tone is what makes blips sound harsh.
      const env = smooth(t / 0.008) * smooth((0.11 - t) / 0.05);
      out[start + i] += (Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) * env;
    }
  }
  applyFilter(out, biquad("lowpass", 2200));
  return normalisePeak(edgeFades(out, 0.5, 10), SFX_PEAK_DB, -11);
}

/* ── the Crate Recap bed ─────────────────────────────────────────── */

/**
 * 80 BPM rather than the brief's ~84: at 80, eight bars of 4/4 are exactly
 * 24.000 s — 1,152,000 samples, 720 frames at 30 fps — so the loop seam is
 * sample-exact and a composition gets a whole-frame duration. 84 BPM would
 * leave a fractional sample per loop and a 685.7-frame bed.
 */
export const BED = {
  bpm: 80,
  bars: 8,
  beatsPerBar: 4,
  seconds: 24,
  fadeInSeconds: 1.5,
  targetLufs: -18,
  truePeakCeilingDb: -3,
};

/** ii–V–I–vi in F, rootless voicings so the pad stays out of the bass's way
 *  and every chord change moves each voice by a step at most. */
const PROGRESSION = [
  { bass: 43, pad: [58, 62, 65, 69] }, // Gm9
  { bass: 48, pad: [58, 62, 64, 69] }, // C13
  { bass: 41, pad: [57, 60, 64, 67] }, // Fmaj9
  { bass: 38, pad: [57, 60, 64, 65] }, // Dm9
];

/**
 * Renders the bed as a circular buffer: every event is written at
 * (start + i) mod N, so a chord's release or a kick's tail that runs past the
 * end lands at the start. That, plus circular filtering and LFOs with whole
 * cycles per loop, makes the end flow into the start with no click and no
 * rhythmic hiccup.
 */
export function synthBedBody() {
  const N = BED.seconds * SR;
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const beat = (60 / BED.bpm) * SR;
  const bar = beat * BED.beatsPerBar;
  const sixteenth = beat / 4;
  const rand = mulberry32(0x62656421);

  const add = (buf, at, v) => {
    buf[((at % N) + N) % N] += v;
  };

  // Tape wow (0.5 Hz) and flutter (5 Hz) as a speed ratio per sample: whole
  // cycles per 24 s loop, so the modulation itself is seamless.
  const wow = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    wow[i] = 1 + 0.0024 * Math.sin(TAU * 0.5 * t) + 0.0005 * Math.sin(TAU * 5 * t);
  }

  // Kick positions drive both the kick and the pad's sidechain duck.
  const kickSteps = [0, 7, 10];
  const kicks = [];
  for (let b = 0; b < BED.bars; b++) for (const s of kickSteps) kicks.push(Math.round(b * bar + s * sixteenth));

  const duck = new Float32Array(N);
  for (const k of kicks) {
    for (let i = 0; i < 0.5 * SR; i++) {
      const t = i / SR;
      const idx = (k + i) % N;
      duck[idx] = Math.max(duck[idx], smooth(t / 0.01) * Math.exp(-t / 0.14));
    }
  }

  /* pad — three detuned voices per note, harmonics rolling off between a
     triangle and a saw, low-passed so it stays warm under everything */
  const padL = new Float32Array(N);
  const padR = new Float32Array(N);
  const chordLen = 2 * bar;
  const releaseS = 1.6;
  const harmonics = Float64Array.from({ length: 9 }, (_, h) => (h === 0 ? 0 : 1 / h ** 1.6));
  for (let c = 0; c < PROGRESSION.length; c++) {
    const start = Math.round(c * chordLen);
    const len = Math.round(chordLen + releaseS * SR);
    for (const note of PROGRESSION[c].pad) {
      for (const [cents, gl, gr] of [
        [-7, 0.85, 0.45],
        [0, 0.65, 0.65],
        [7, 0.45, 0.85],
      ]) {
        const hz = midiHz(note) * 2 ** (cents / 1200);
        let theta = rand() * TAU;
        for (let i = 0; i < len; i++) {
          const att = smooth(i / SR / 0.45);
          const r = (i - chordLen) / SR;
          // Exponential release, shaped to land on exactly zero at the end of
          // the tail rather than being cut off at -30 dB.
          const rel = r <= 0 ? 1 : Math.exp(-r / 0.45) * smooth(1 - r / releaseS);
          const at = (start + i) % N;
          // Phase accumulates the wow, so pitch wobbles by the wow depth and
          // no more however long the note is held.
          theta += (TAU * hz * wow[at]) / SR;
          // sin(hθ) for h = 1..8 by the Chebyshev recurrence — two trig calls
          // per sample instead of eight.
          const c2 = 2 * Math.cos(theta);
          let prev = 0;
          let cur = Math.sin(theta);
          let v = 0;
          for (let h = 1; h < harmonics.length; h++) {
            v += cur * harmonics[h];
            const next = c2 * cur - prev;
            prev = cur;
            cur = next;
          }
          v *= att * rel * 0.045;
          padL[at] += v * gl;
          padR[at] += v * gr;
        }
      }
    }
  }
  const padLp = () => chain(biquad("lowpass", 2400, 0.6), biquad("peaking", 280, 0.8, 1.5));
  applyFilterCircular(padL, padLp());
  applyFilterCircular(padR, padLp());

  /* bass — a soft sine on the root, beat 1 and the "and" of 2 */
  const bass = new Float32Array(N);
  for (let b = 0; b < BED.bars; b++) {
    const hz = midiHz(PROGRESSION[Math.floor(b / 2)].bass);
    for (const [step, lenS] of [
      [0, 1.1],
      [6, 0.9],
    ]) {
      const start = Math.round(b * bar + step * sixteenth);
      for (let i = 0; i < lenS * SR; i++) {
        const t = i / SR;
        const env = smooth(t / 0.012) * smooth((lenS - t) / 0.12) * Math.exp(-t / 0.9);
        const ph = TAU * hz * t;
        // The upper partials are for phone speakers, which can't reproduce a
        // 73–131 Hz fundamental and would otherwise lose the bass entirely.
        add(bass, start + i, (Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) * env * 0.26);
      }
    }
  }

  for (let i = 0; i < N; i++) {
    const d = 1 - 0.28 * duck[i];
    L[i] += (padL[i] + bass[i]) * d;
    R[i] += (padR[i] + bass[i]) * d;
  }

  /* drums */
  const pink = pinkSource(rand);
  for (const k of kicks) {
    let ph = 0;
    for (let i = 0; i < 0.45 * SR; i++) {
      const t = i / SR;
      ph += (TAU * (47 + 68 * Math.exp(-t / 0.028))) / SR;
      const s = Math.sin(ph) * smooth(t / 0.002) * Math.exp(-t / 0.15) * 0.5;
      add(L, k + i, s);
      add(R, k + i, s);
    }
  }
  for (let b = 0; b < BED.bars; b++) {
    for (const step of [4, 12]) {
      const at = Math.round(b * bar + step * sixteenth);
      const bp = chain(biquad("bandpass", 1700, 0.8), biquad("lowpass", 5500));
      for (let i = 0; i < 0.3 * SR; i++) {
        const t = i / SR;
        const att = smooth(t / 0.0015);
        const s = bp(pink() * Math.exp(-t / 0.065) * att) * 0.5 + Math.sin(TAU * 185 * t) * Math.exp(-t / 0.045) * att * 0.12;
        add(L, at + i, s * 0.9);
        add(R, at + i, s);
      }
    }
    // Hats on the eighths, swung: lo-fi lives on the late offbeat.
    for (let e = 0; e < 8; e++) {
      const swing = e % 2 === 1 ? 0.16 * beat : 0;
      const at = Math.round(b * bar + e * (beat / 2) + swing);
      const vel = (e % 2 === 0 ? 0.12 : 0.08) * (0.8 + 0.4 * rand());
      const hp = chain(biquad("highpass", 5000, 0.7), biquad("lowpass", 11000));
      for (let i = 0; i < 0.09 * SR; i++) {
        const t = i / SR;
        const s = hp(rand() * 2 - 1) * smooth(t / 0.001) * Math.exp(-t / 0.022) * vel;
        add(L, at + i, s * 0.8);
        add(R, at + i, s);
      }
    }
  }

  /* tape hiss — independent per channel for width, breathing at 0.25 Hz */
  const hissL = new Float32Array(N);
  const hissR = new Float32Array(N);
  const pl = pinkSource(mulberry32(0x68697373));
  const pr = pinkSource(mulberry32(0x73736968));
  for (let i = 0; i < N; i++) {
    const breathe = 1 + 0.15 * Math.sin((TAU * 0.25 * i) / SR);
    hissL[i] = pl() * breathe;
    hissR[i] = pr() * breathe;
  }
  const hissBand = () => chain(biquad("highpass", 1800, 0.6), biquad("lowpass", 9000, 0.6));
  applyFilterCircular(hissL, hissBand());
  applyFilterCircular(hissR, hissBand());
  for (let i = 0; i < N; i++) {
    L[i] += hissL[i] * 0.02;
    R[i] += hissR[i] * 0.02;
  }

  /* tape: rumble cut, soft saturation, then the lo-fi top-end roll-off */
  const pre = 0.85 / peakOf(L, R);
  const drive = 1.6;
  const sat = (x) => Math.tanh(x * pre * drive) / Math.tanh(drive);
  for (const ch of [L, R]) {
    applyFilterCircular(ch, biquad("highpass", 32, 0.7));
    for (let i = 0; i < N; i++) ch[i] = sat(ch[i]);
    applyFilterCircular(ch, biquad("lowpass", 9000, 0.6));
  }
  return [L, R];
}

/** The bed as shipped: the circular body with a gentle raised-cosine fade-in.
 *  The fade is applied last so it is the only thing that isn't circular —
 *  the seam itself has no click and no rhythmic break. */
export function synthBed() {
  const [L, R] = synthBedBody();
  const fade = Math.round(BED.fadeInSeconds * SR);
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    L[i] *= g;
    R[i] *= g;
  }
  return [L, R];
}

/* ── WAV + FFmpeg ────────────────────────────────────────────────── */

/** 32-bit float WAV, interleaved — float so nothing is quantised before the
 *  encoder sees it. */
export function encodeWav(channels) {
  const nCh = channels.length;
  const n = channels[0].length;
  const dataBytes = n * nCh * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(nCh, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * nCh * 4, 28);
  buf.writeUInt16LE(nCh * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      buf.writeFloatLE(channels[c][i], o);
      o += 4;
    }
  }
  return buf;
}

/**
 * Remotion's bundled FFmpeg 7.1 — the repo's one FFmpeg, no system install.
 * This is `npx remotion ffmpeg|ffprobe` without npx's ~2 s of package
 * resolution per call (the build makes ~30 calls). Returns stdout and stderr;
 * throws with stderr attached on a non-zero exit.
 */
const REMOTION_CLI = path.join(ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js");

function remotion(tool, args) {
  const r = spawnSync(process.execPath, [REMOTION_CLI, tool, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`remotion ${tool} ${args.join(" ")} failed:\n${r.stderr || r.error}`);
  return { stdout: r.stdout, stderr: r.stderr };
}

/** The Remotion CLI prints a version banner around the tool's own output, so
 *  take the last balanced JSON object rather than parsing the whole stream. */
function lastJson(text) {
  const end = text.lastIndexOf("}");
  for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* keep widening until the braces balance */
    }
  }
  throw new Error(`no JSON in output:\n${text.slice(-800)}`);
}

/** Runs an analysis filter; FFmpeg reports those on stderr. */
function analyse(file, filter) {
  return remotion("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", filter, "-f", "null", "-"]).stderr;
}

/** Integrated loudness and true peak, from loudnorm's analysis pass. */
function measureLoudness(file) {
  const j = lastJson(analyse(file, `loudnorm=I=${BED.targetLufs}:TP=${BED.truePeakCeilingDb}:LRA=11:print_format=json`));
  return { lufs: Number(j.input_i), truePeakDb: Number(j.input_tp) };
}

/** Decode to 24-bit WAV. This FFmpeg build is trimmed to what Remotion needs
 *  (no volumedetect/astats, no raw muxers), so measurement happens in JS. */
function decode(file, tmp) {
  const out = path.join(tmp, "decoded.wav");
  remotion("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-c:a", "pcm_s24le", out]);
  return readFileSync(out);
}

/**
 * Duration and sample peak of a 24-bit PCM WAV, walking chunks to "data".
 * Run on the decoded output this is what a listener actually gets: decoders
 * honour the Opus pre-skip and LAME's gapless header, so it should match the
 * synthesised length to the sample.
 */
export function readWav24(b) {
  let o = 12;
  let channels = 1;
  let rate = SR;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(o + 10);
      rate = b.readUInt32LE(o + 12);
    }
    if (id === "data") {
      const end = Math.min(b.length, o + 8 + size);
      let p = 0;
      for (let i = o + 8; i + 3 <= end; i += 3) p = Math.max(p, Math.abs(b.readIntLE(i, 3)));
      return {
        seconds: (end - o - 8) / 3 / channels / rate,
        peakDb: p > 0 ? 20 * Math.log10(p / 8388608) : -Infinity,
      };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error("decoded WAV has no data chunk");
}

/** Opus and mp3 settings. -bitexact and stripped metadata keep the files
 *  byte-identical between runs (no encoder version or timestamps baked in). */
const FORMATS = {
  webm: {
    codec: "opus",
    args: (ch) => ["-c:a", "libopus", "-b:a", ch === 1 ? "48k" : "80k", "-vbr", "on", "-application", "audio"],
    // Container duration counts the 312-sample pre-skip and rounds up to a
    // whole 20 ms packet.
    framing: (312 + 960) / SR,
  },
  mp3: {
    codec: "mp3",
    args: (ch) => ["-c:a", "libmp3lame", "-b:a", ch === 1 ? "96k" : "112k", "-id3v2_version", "0"],
    // Container duration counts LAME's 1105-sample encoder+decoder delay and
    // rounds up to a whole 1152-sample frame.
    framing: (1105 + 1152) / SR,
  },
};

function encode(wav, outFile, fmt, nCh) {
  remotion("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", wav,
    "-map_metadata", "-1",
    "-fflags", "+bitexact", "-flags:a", "+bitexact",
    "-ar", String(SR), "-ac", String(nCh),
    ...FORMATS[fmt].args(nCh),
    outFile,
  ]);
}

/* ── the manifest ────────────────────────────────────────────────── */

/**
 * Bed first: the Crate Recap composition depends on it, so it is never the
 * thing left unbuilt by a failure further down the list.
 *
 * maxBytes are per file. Short sounds stay under 15 KB so preloading all four
 * on enable costs less than one album thumbnail.
 */
export const SOUNDS = [
  { name: "recap-bed", synth: synthBed, seconds: BED.seconds, channels: 2, maxBytes: 400 * 1024, loudness: "lufs" },
  { name: "key", synth: () => [synthKey()], seconds: 0.07, channels: 1, maxBytes: 15 * 1024, loudness: "peak" },
  { name: "drop", synth: () => [synthDrop()], seconds: 0.18, channels: 1, maxBytes: 15 * 1024, loudness: "peak" },
  { name: "success", synth: () => [synthSuccess()], seconds: 0.6, channels: 1, maxBytes: 15 * 1024, loudness: "peak" },
  { name: "error", synth: () => [synthError()], seconds: 0.3, channels: 1, maxBytes: 15 * 1024, loudness: "peak" },
];

/**
 * Duration checks, two ways. The decoded length is what plays, and must match
 * the synthesis to within a millisecond. The container duration ffprobe
 * reports also counts codec framing (see FORMATS), so it may run long by at
 * most that much — never short. Anything else is a truncated or padded file.
 */
export function decodedDurationOk(expected, actual) {
  return Math.abs(actual - expected) <= 0.001;
}

export function containerDurationOk(expected, actual, framing) {
  return actual >= expected - 0.001 && actual <= expected + framing + 0.001;
}

function probe(file) {
  const j = lastJson(remotion("ffprobe", ["-v", "error", "-of", "json", "-show_format", "-show_streams", file]).stdout);
  const audio = (j.streams || []).filter((s) => s.codec_type === "audio");
  return {
    codec: audio[0]?.codec_name,
    channels: audio[0]?.channels,
    sampleRate: Number(audio[0]?.sample_rate),
    streams: audio.length,
    duration: Number(j.format?.duration),
  };
}

function bedGain(wav) {
  const { lufs, truePeakDb } = measureLoudness(wav);
  let gainDb = BED.targetLufs - lufs;
  if (truePeakDb + gainDb > BED.truePeakCeilingDb) gainDb = BED.truePeakCeilingDb - truePeakDb;
  return { gainDb, lufs, truePeakDb };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const tmp = mkdtempSync(path.join(tmpdir(), "pulsar-sfx-"));
  const failures = [];
  const rows = [];
  try {
    for (const s of SOUNDS) {
      const channels = s.synth();
      const wav = path.join(tmp, `${s.name}.wav`);
      writeFileSync(wav, encodeWav(channels));

      if (s.loudness === "lufs") {
        const { gainDb, lufs, truePeakDb } = bedGain(wav);
        scale(dbToGain(gainDb), ...channels);
        writeFileSync(wav, encodeWav(channels));
        console.log(`${s.name}: measured ${lufs.toFixed(1)} LUFS / ${truePeakDb.toFixed(1)} dBTP, applied ${gainDb >= 0 ? "+" : ""}${gainDb.toFixed(2)} dB`);
      }

      for (const fmt of Object.keys(FORMATS)) {
        const file = path.join(OUT, `${s.name}.${fmt}`);
        // A stale file from an earlier run must not pass for a fresh encode.
        rmSync(file, { force: true });
        encode(wav, file, fmt, s.channels);
        const rel = path.relative(ROOT, file);
        if (!existsSync(file)) {
          failures.push(`${rel}: missing`);
          continue;
        }
        const bytes = statSync(file).size;
        const p = probe(file);
        const decoded = readWav24(decode(file, tmp));
        const peak = Math.round(decoded.peakDb * 100) / 100;
        const row = { file: rel, codec: p.codec, ch: p.channels, seconds: p.duration, played: decoded.seconds, bytes, peak };
        if (s.loudness === "lufs") row.lufs = measureLoudness(file).lufs;
        rows.push(row);

        if (p.streams !== 1) failures.push(`${rel}: expected 1 audio stream, found ${p.streams}`);
        if (p.codec !== FORMATS[fmt].codec) failures.push(`${rel}: codec ${p.codec}, expected ${FORMATS[fmt].codec}`);
        if (p.channels !== s.channels) failures.push(`${rel}: ${p.channels} channels, expected ${s.channels}`);
        if (p.sampleRate !== SR) failures.push(`${rel}: ${p.sampleRate} Hz, expected ${SR}`);
        if (!Number.isFinite(p.duration) || !containerDurationOk(s.seconds, p.duration, FORMATS[fmt].framing))
          failures.push(`${rel}: ffprobe says ${p.duration}s, expected ${s.seconds}s (+ codec framing)`);
        if (!decodedDurationOk(s.seconds, decoded.seconds))
          failures.push(`${rel}: decodes to ${decoded.seconds}s, expected ${s.seconds}s`);
        if (bytes > s.maxBytes) failures.push(`${rel}: ${bytes} bytes, budget ${s.maxBytes}`);
        // Lossy codecs overshoot the source peak a little; allow 1.5 dB. A
        // near-silent file means the encode or the synth broke.
        if (peak > SFX_PEAK_DB + 1.5) failures.push(`${rel}: peak ${peak} dBFS, ceiling ${SFX_PEAK_DB} dBFS`);
        if (!(peak > -30)) failures.push(`${rel}: peak ${peak} dBFS — effectively silent`);
        if (row.lufs !== undefined && Math.abs(row.lufs - BED.targetLufs) > 1.5)
          failures.push(`${rel}: ${row.lufs} LUFS, target ${BED.targetLufs}`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.table(
    rows.map((r) => ({
      file: r.file,
      codec: r.codec,
      ch: r.ch,
      "probed s": r.seconds.toFixed(3),
      "played s": r.played.toFixed(3),
      KB: (r.bytes / 1024).toFixed(1),
      "peak dBFS": r.peak,
      ...(r.lufs !== undefined ? { LUFS: r.lufs.toFixed(1) } : {}),
    }))
  );
  if (failures.length) {
    console.error(`\n✗ ${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`\n✓ ${rows.length} files in ${path.relative(ROOT, OUT)}/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
