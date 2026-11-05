/**
 * Render the explainer to MP4 without anyone at the keyboard.
 *
 *   npm run render            → output/how-sampling-works.mp4
 *
 * Motion Canvas renders in the browser: the editor draws each frame and
 * streams it over the dev server's websocket to the FFmpeg exporter, which
 * encodes on this machine. So this starts the dev server, opens the editor in
 * headless Chromium and presses Render — the same thing a person would do —
 * using the exporter and settings saved in src/project.meta (1920×1080,
 * 30 fps, H.264 via @motion-canvas/ffmpeg).
 *
 * "Done" is the exporter's own acknowledgement that FFmpeg has finished the
 * file, read off the websocket, not a guess from the file size settling.
 *
 * Playwright comes from the app's devDependencies (one directory up); set
 * CHROMIUM_PATH to use a particular Chromium build.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output');
const target = path.join(output, 'how-sampling-works.mp4');
const TIMEOUT_MS = 15 * 60 * 1000;

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: {port: 9100, strictPort: false},
  logLevel: 'warn',
});

// The bridge answers every exporter call with an ack on the websocket; the
// ack for `end` comes once FFmpeg has closed the file.
const finished = new Promise((resolve, reject) => {
  const send = server.ws.send.bind(server.ws);
  server.ws.send = (...args) => {
    const [event, payload] = args;
    if (event === 'motion-canvas/ffmpeg-ack') {
      if (payload?.status === 'error') reject(new Error(`FFmpeg exporter: ${payload.message}`));
      else if (payload?.method === 'end') resolve();
    }
    return send(...args);
  };
});

let browser;
try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('The dev server did not report a URL.');

  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
  const page = await browser.newPage({viewport: {width: 1400, height: 900}});
  page.on('pageerror', err => console.error('editor:', err.message));
  await page.goto(url);

  const render = page.locator('button', {hasText: /^render$/i}).first();
  await render.waitFor({timeout: 60_000});
  const started = Date.now();
  console.log('Rendering…');
  await render.click();

  let timer;
  await Promise.race([
    finished,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Render timed out.')), TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));

  // The exporter names the file after the project.
  const made = path.join(output, 'project.mp4');
  if (!fs.existsSync(made)) throw new Error(`Expected ${made}`);
  fs.renameSync(made, target);
  const mb = (fs.statSync(target).size / 1e6).toFixed(1);
  console.log(`${path.relative(process.cwd(), target)} — ${mb} MB in ${Math.round((Date.now() - started) / 1000)} s`);
} finally {
  await browser?.close();
  await server.close();
}
