#!/usr/bin/env node
/**
 * npm run motion:render [props.json] [out.mp4]
 *
 * The "render" stage of the motion loop: bundles remotion/index.ts, resolves
 * the CrateRecap composition against the given props (its calculateMetadata
 * sets the duration from the record count) and encodes an H.264 MP4 with
 * @remotion/renderer.
 *
 *   props   default motion/props/crate-recap.sample.json
 *   out     default motion/out/crate-recap.mp4
 *
 * Then `npm run motion:review` checks what came out.
 *
 * Browser, first found: REMOTION_BROWSER_EXECUTABLE; Playwright's Chromium
 * headless shell (/opt/pw-browsers/chromium_headless_shell-*); Playwright's full
 * Chromium at /opt/pw-browsers/chromium; else Remotion downloads its own Chrome
 * Headless Shell. (For sandboxes and CI images that can't download.) The
 * headless shell comes first because it's what Remotion targets: full
 * Chromium 141 under SwiftShader froze mid-render in 2 of 4 runs here, the
 * shell didn't, and it was ~25% faster. A full Chrome no longer has the old
 * headless mode Remotion launches by default, so anything that isn't a
 * headless shell runs as "chrome-for-testing" (--headless=new).
 * REMOTION_CHROME_MODE overrides.
 *
 * This script does not read remotion.config.ts (that is CLI/Studio only);
 * the same defaults are restated below — change both together.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COMPOSITION_ID = "CrateRecap";
const PLAYWRIGHT_BROWSERS = "/opt/pw-browsers";
const PLAYWRIGHT_CHROMIUM = `${PLAYWRIGHT_BROWSERS}/chromium`;

const [propsArg, outArg] = process.argv.slice(2);
const propsPath = path.resolve(ROOT, propsArg ?? "motion/props/crate-recap.sample.json");
const outPath = path.resolve(ROOT, outArg ?? "motion/out/crate-recap.mp4");

function browserExecutable() {
  const fromEnv = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`REMOTION_BROWSER_EXECUTABLE does not exist: ${fromEnv}`);
    return fromEnv;
  }
  const shells = existsSync(PLAYWRIGHT_BROWSERS)
    ? readdirSync(PLAYWRIGHT_BROWSERS)
        .filter((d) => d.startsWith("chromium_headless_shell-"))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
        .map((d) => path.join(PLAYWRIGHT_BROWSERS, d, "chrome-linux", "headless_shell"))
        .filter((p) => existsSync(p))
    : [];
  if (shells.length) return shells[0];
  return existsSync(PLAYWRIGHT_CHROMIUM) ? PLAYWRIGHT_CHROMIUM : null;
}

/** "headless-shell" for a headless shell (or Remotion's own download), else "chrome-for-testing". */
function chromeMode(browser) {
  const fromEnv = process.env.REMOTION_CHROME_MODE;
  if (fromEnv === "headless-shell" || fromEnv === "chrome-for-testing") return fromEnv;
  if (!browser) return "headless-shell";
  return /headless[_-]shell/.test(path.basename(browser)) ? "headless-shell" : "chrome-for-testing";
}

/** One line, rewritten in place on a terminal; plain lines in CI logs. */
function status(line) {
  if (process.stdout.isTTY) process.stdout.write(`\r${line.padEnd(78)}`);
  else console.log(line);
}

async function main() {
  const inputProps = JSON.parse(readFileSync(propsPath, "utf8"));
  const outDir = path.dirname(outPath);
  mkdirSync(outDir, { recursive: true });
  // Renders are build output, never source: the folder ignores itself so a
  // stray `git add .` can't commit a 10 MB MP4.
  const ignore = path.join(ROOT, "motion/out/.gitignore");
  if (outDir.startsWith(path.join(ROOT, "motion/out")) && !existsSync(ignore)) writeFileSync(ignore, "*\n");

  const browser = browserExecutable();
  const mode = chromeMode(browser);
  // Headless Linux has no GPU: SwiftShader behind ANGLE is Remotion's choice there.
  const chromiumOptions = { gl: process.env.REMOTION_GL || "swangle" };
  console.log(`props    ${path.relative(ROOT, propsPath)}`);
  console.log(`browser  ${browser ?? "Remotion Chrome Headless Shell (auto-download)"} (${mode})`);

  let lastBundle = -1;
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "remotion/index.ts"),
    rootDir: ROOT,
    publicDir: path.join(ROOT, "public"),
    onProgress: (p) => {
      const pct = Math.round(p);
      if (pct !== lastBundle && pct % 10 === 0) status(`bundling ${pct}%`);
      lastBundle = pct;
    },
  });
  if (process.stdout.isTTY) process.stdout.write("\n");

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
    browserExecutable: browser,
    chromeMode: mode,
    chromiumOptions,
  });
  const seconds = (composition.durationInFrames / composition.fps).toFixed(2);
  console.log(
    `comp     ${composition.id} ${composition.width}x${composition.height} @ ${composition.fps} fps, ` +
      `${composition.durationInFrames} frames (${seconds} s), ${composition.props.records?.length ?? 0} records, ` +
      `audio ${composition.props.withAudio ? "on" : "off"}`
  );

  const started = Date.now();
  let lastPct = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
    browserExecutable: browser,
    chromeMode: mode,
    chromiumOptions,
    imageFormat: "jpeg",
    jpegQuality: 90,
    pixelFormat: "yuv420p",
    // Tagged, limited-range BT.709 — what phones and social apps expect. The
    // v4 default leaves JPEG frames as untagged full-range yuvj420p.
    colorSpace: "bt709",
    overwrite: true,
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
      // Every percent on a terminal (rewritten in place); every tenth in a log.
      const pct = Math.floor(progress * (process.stdout.isTTY ? 100 : 10)) * (process.stdout.isTTY ? 1 : 10);
      if (pct === lastPct) return;
      lastPct = pct;
      status(
        `render   ${String(pct).padStart(3)}%  frames ${renderedFrames}/${composition.durationInFrames}` +
          `  encoded ${encodedFrames}  ${stitchStage}`
      );
    },
  });
  if (process.stdout.isTTY) process.stdout.write("\n");

  // What the review stage should find in the file. Written from the resolved
  // composition, so motion:review never re-derives the timing formula.
  const manifest = {
    composition: composition.id,
    props: path.relative(ROOT, propsPath),
    codec: "h264",
    pixelFormat: "yuv420p",
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: composition.durationInFrames,
    durationInSeconds: composition.durationInFrames / composition.fps,
    records: composition.props.records?.length ?? 0,
    audio: composition.props.withAudio === true,
  };
  writeFileSync(`${outPath}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`done     ${path.relative(ROOT, outPath)} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`next     npm run motion:review -- ${path.relative(ROOT, outPath)}`);
}

main().catch((err) => {
  console.error(`\nmotion:render failed: ${err?.stack ?? err}`);
  process.exit(1);
});
