#!/usr/bin/env node
/**
 * npm run motion:review [video] [-- --duration 8.8 --no-audio --frames 6]
 *
 * The "review" stage of the motion loop (brief → design → animate → build →
 * sound → render → REVIEW → ship). Inspects a rendered video with FFprobe and
 * FFmpeg — the copies bundled with Remotion, via `npx remotion ffprobe|ffmpeg`
 * — and fails loudly instead of letting a broken export ship:
 *
 *   - video codec, pixel format, width × height, frame rate
 *   - duration (and frame count) within a frame or two of what was rendered
 *   - an audio stream when one was expected, and that it isn't silence
 *   - no blank frames among the sampled ones (a scene that failed to draw)
 *
 * Expectations come from the manifest scripts/motion/render.mjs writes next to
 * the video (<video>.json); flags override it. It then lays evenly spaced
 * frames out as a contact sheet, motion/out/<name>-sheet.png, for a human (or
 * an agent) to look at, prints a JSON report, and exits 1 if a check failed.
 *
 * Remotion's FFmpeg is a minimal build — no tile, select, volumedetect or
 * blackdetect filters — so frames come out one at a time as raw RGB, are tiled
 * here, and the sheet is written as a PNG with zlib; loudness comes from the
 * loudnorm filter, which it does include.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TILE_WIDTH = 320;
const PAD = 12;
const SHEET_BG = [0x0b, 0x0d, 0x10]; // Pulsar's deck

/* ── arguments ─────────────────────────────────────────────────── */

const VALUED = new Set(["duration", "frames", "codec", "width", "height", "fps"]);
const flags = {};
const positional = [];
for (let argv = process.argv.slice(2), i = 0; i < argv.length; i++) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(argv[i]);
  if (!m) positional.push(argv[i]);
  else if (m[2] !== undefined) flags[m[1]] = m[2];
  else if (VALUED.has(m[1])) flags[m[1]] = argv[++i];
  else flags[m[1]] = true;
}
const flag = (name) => (typeof flags[name] === "string" ? flags[name] : undefined);
const has = (name) => flags[name] === true;

const file = path.resolve(ROOT, positional[0] ?? "motion/out/crate-recap.mp4");
const name = path.basename(file).replace(/\.[^.]+$/, "");
const sheetPath = path.join(path.dirname(file), `${name}-sheet.png`);
const frameCount = Math.max(2, Math.min(12, Number(flag("frames") ?? 6)));

const manifestPath = `${file}.json`;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const expected = {
  codec: flag("codec") ?? manifest.codec ?? "h264",
  pixelFormat: manifest.pixelFormat ?? "yuv420p",
  width: Number(flag("width") ?? manifest.width ?? 1080),
  height: Number(flag("height") ?? manifest.height ?? 1920),
  fps: Number(flag("fps") ?? manifest.fps ?? 30),
  duration: flag("duration") !== undefined ? Number(flag("duration")) : (manifest.durationInSeconds ?? null),
  frames: flag("duration") !== undefined ? null : (manifest.durationInFrames ?? null),
  audio: has("no-audio") ? false : has("audio") ? true : (manifest.audio ?? null),
};

/* ── tools ─────────────────────────────────────────────────────── */

/**
 * `npx remotion <tool> …`. Remotion's version warnings go to stderr, but its
 * CLI also prints blank lines to stdout — fine for JSON, fatal for binary, so
 * binary output always goes to a file.
 */
function remotion(tool, toolArgs) {
  const res = spawnSync("npx", ["--no-install", "remotion", tool, ...toolArgs], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  return { code: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

const lastLine = (text) => text.trim().split("\n").pop() ?? "";

function ratio(value) {
  const [n, d] = String(value ?? "0/1").split("/").map(Number);
  return d ? n / d : n;
}

/** Minimal truecolour PNG: one IDAT, filter 0 on every row. */
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Mean luma and its spread for an RGB frame: a blank frame has almost no spread. */
function frameStats(rgb) {
  let sum = 0;
  let sumSq = 0;
  const n = rgb.length / 3;
  for (let i = 0; i < rgb.length; i += 3) {
    const y = 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
    sum += y;
    sumSq += y * y;
  }
  const mean = sum / n;
  return { mean: Number(mean.toFixed(1)), spread: Number(Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(1)) };
}

/* ── review ────────────────────────────────────────────────────── */

const checks = [];
function check(label, ok, actual, want, note) {
  checks.push({ name: label, ok: Boolean(ok), actual, expected: want, ...(note ? { note } : {}) });
}

function main() {
  if (!existsSync(file)) {
    console.error(`motion:review: no such file ${path.relative(ROOT, file)} — run npm run motion:render first.`);
    process.exit(1);
  }

  const probe = remotion("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  if (probe.code !== 0) throw new Error(`ffprobe failed: ${lastLine(probe.stderr)}`);
  const info = JSON.parse(probe.stdout);
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");

  check("video stream", video, video ? "present" : "missing", "present");
  if (!video) return finish(info, null);

  const fps = ratio(video.avg_frame_rate || video.r_frame_rate);
  const duration = Number(video.duration ?? info.format.duration);
  const frames = Number(video.nb_frames ?? Math.round(duration * fps));
  // A frame and a half: encoders round the last frame's timestamp either way.
  const tolerance = 1.5 / (expected.fps || fps || 30);

  check("video codec", video.codec_name === expected.codec, video.codec_name, expected.codec);
  check("pixel format", video.pix_fmt === expected.pixelFormat, video.pix_fmt, expected.pixelFormat);
  check(
    "dimensions",
    video.width === expected.width && video.height === expected.height,
    `${video.width}x${video.height}`,
    `${expected.width}x${expected.height}`
  );
  check("frame rate", Math.abs(fps - expected.fps) < 0.01, Number(fps.toFixed(3)), expected.fps);
  if (expected.duration !== null) {
    check(
      "duration (s)",
      Math.abs(duration - expected.duration) <= tolerance,
      Number(duration.toFixed(3)),
      Number(expected.duration.toFixed(3)),
      `±${tolerance.toFixed(3)} s`
    );
  } else {
    check("duration (s)", duration > 0, Number(duration.toFixed(3)), "> 0", "no manifest or --duration: length not compared");
  }
  if (expected.frames !== null && Number.isFinite(frames)) {
    check("frame count", Math.abs(frames - expected.frames) <= 1, frames, expected.frames, "±1");
  }

  // Audio: present when expected, and audible — a muted mix still muxes a track.
  let loudness = null;
  if (expected.audio === true || (expected.audio === null && audio)) {
    check(
      "audio stream",
      audio,
      audio ? `${audio.codec_name} ${audio.sample_rate} Hz ${audio.channels}ch` : "missing",
      "present"
    );
    if (audio) {
      const ln = remotion("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
      const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(ln.stderr)?.[0];
      const stats = json ? JSON.parse(json) : null;
      const num = (v) => (v === undefined || v === "-inf" ? null : Number(v));
      loudness = stats ? { integratedLufs: num(stats.input_i), truePeakDb: num(stats.input_tp) } : null;
      check("audio not silent", loudness?.integratedLufs != null && loudness.integratedLufs > -50, loudness?.integratedLufs ?? null, "> -50 LUFS");
    }
  } else if (expected.audio === false) {
    check("no audio stream", !audio, audio ? "present" : "none", "none");
  }

  // Sampled frames, centred in their slices so the first tile isn't the empty
  // frame 0 and the last isn't the final fade.
  const tileH = 2 * Math.round((TILE_WIDTH * video.height) / video.width / 2);
  const total = Number.isFinite(frames) && frames > 0 ? frames : Math.round(duration * fps);
  const picks = Array.from({ length: frameCount }, (_, i) => Math.min(total - 1, Math.round(((i + 0.5) / frameCount) * total)));
  const tmp = mkdtempSync(path.join(os.tmpdir(), "motion-review-"));
  const tiles = [];
  try {
    for (const [i, n] of picks.entries()) {
      const out = path.join(tmp, `${i}.rgb`);
      const res = remotion("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", (n / fps).toFixed(4), "-i", file, "-frames:v", "1",
        "-vf", `scale=${TILE_WIDTH}:${tileH}`, "-c:v", "rawvideo", "-pix_fmt", "rgb24", "-f", "image2pipe", out,
      ]);
      const rgb = res.code === 0 && existsSync(out) ? readFileSync(out) : null;
      tiles.push(rgb && rgb.length >= TILE_WIDTH * tileH * 3 ? rgb.subarray(0, TILE_WIDTH * tileH * 3) : null);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const stats = tiles.map((t) => (t ? frameStats(t) : null));
  const blank = picks.filter((_, i) => !stats[i] || stats[i].spread < 4);
  check("sampled frames decoded", tiles.every(Boolean), `${tiles.filter(Boolean).length}/${tiles.length}`, `${tiles.length}/${tiles.length}`);
  check("no blank frames", blank.length === 0, blank.length ? blank : "none", "none", "luma spread < 4 = a flat frame");

  // Contact sheet: up to six across, then a second row.
  const cols = frameCount <= 6 ? frameCount : Math.ceil(frameCount / 2);
  const rows = Math.ceil(frameCount / cols);
  const sheetW = PAD + cols * (TILE_WIDTH + PAD);
  const sheetH = PAD + rows * (tileH + PAD);
  const sheet = Buffer.alloc(sheetW * sheetH * 3);
  for (let p = 0; p < sheet.length; p += 3) sheet.set(SHEET_BG, p);
  tiles.forEach((tile, i) => {
    if (!tile) return;
    const x0 = PAD + (i % cols) * (TILE_WIDTH + PAD);
    const y0 = PAD + Math.floor(i / cols) * (tileH + PAD);
    for (let y = 0; y < tileH; y++) {
      tile.copy(sheet, ((y0 + y) * sheetW + x0) * 3, y * TILE_WIDTH * 3, (y + 1) * TILE_WIDTH * 3);
    }
  });
  mkdirSync(path.dirname(sheetPath), { recursive: true });
  writeFileSync(sheetPath, encodePng(sheetW, sheetH, sheet));
  check("contact sheet", existsSync(sheetPath), path.relative(ROOT, sheetPath), "written");

  finish(info, { video, audio, fps, duration, frames, loudness, picks, stats });
}

function finish(info, measured) {
  const ok = checks.every((c) => c.ok);
  const report = {
    ok,
    file: path.relative(ROOT, file),
    manifest: existsSync(manifestPath) ? path.relative(ROOT, manifestPath) : null,
    sizeBytes: Number(info.format?.size ?? 0),
    bitrateKbps: Math.round(Number(info.format?.bit_rate ?? 0) / 1000),
    video: measured?.video
      ? {
          codec: measured.video.codec_name,
          profile: measured.video.profile,
          pixelFormat: measured.video.pix_fmt,
          colorSpace: measured.video.color_space ?? null,
          width: measured.video.width,
          height: measured.video.height,
          fps: Number(measured.fps.toFixed(3)),
          durationSeconds: Number(measured.duration.toFixed(3)),
          frames: measured.frames,
        }
      : null,
    audio: measured?.audio
      ? {
          codec: measured.audio.codec_name,
          sampleRate: Number(measured.audio.sample_rate),
          channels: measured.audio.channels,
          durationSeconds: Number(Number(measured.audio.duration ?? 0).toFixed(3)),
          ...(measured.loudness ?? {}),
        }
      : null,
    contactSheet:
      measured && existsSync(sheetPath)
        ? {
            path: path.relative(ROOT, sheetPath),
            frames: measured.picks.map((n, i) => ({ frame: n, seconds: Number((n / measured.fps).toFixed(2)), ...measured.stats[i] })),
          }
        : null,
    checks,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!ok) {
    console.error(`motion:review: ${checks.filter((c) => !c.ok).map((c) => c.name).join(", ")} failed`);
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(`motion:review failed: ${err?.stack ?? err}`);
  process.exit(1);
}
