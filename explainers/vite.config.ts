import {defineConfig} from 'vite';
import motionCanvasPlugin from '@motion-canvas/vite-plugin';
import ffmpegPlugin from '@motion-canvas/ffmpeg';

// Both plugins are CommonJS with `exports.default`. This package is an ES
// module, and Node's ESM loader hands back the whole exports object as the
// default import, so unwrap it rather than call an object.
const unwrap = <T>(mod: T): T => (mod as {default?: T}).default ?? mod;
const motionCanvas = unwrap(motionCanvasPlugin);
const ffmpeg = unwrap(ffmpegPlugin);

export default defineConfig(({command}) => ({
  // Relative asset URLs (fonts) resolve against the module's own URL, so the
  // bundle works wherever it is served — /explainers/ in Pulsar, / in a
  // preview — without hard-coding a base path.
  base: './',
  // Vite looks for a PostCSS config up the tree and would find the app's,
  // running Tailwind over the editor's styles. This project has no CSS of its own.
  css: {postcss: {}},
  plugins: [
    motionCanvas({project: './src/project.ts', output: './output'}),
    // The FFmpeg exporter only exists for the editor's Render button. Its
    // client half would otherwise be bundled into project.js for every viewer.
    ...(command === 'serve' ? [ffmpeg()] : []),
  ],
  build: {
    outDir: '../public/explainers',
    emptyOutDir: true,
    rollupOptions: {
      // The plugin adds the one entry, `project`. It also carries the player
      // element (src/project.ts imports src/player.ts), so the app loads a
      // single self-contained module with ONE copy of @motion-canvas/core:
      // core keeps module-level state the player and the scenes both touch.
      output: {
        // A stable name: the app imports /explainers/project.js and points
        // <motion-canvas-player src> at it. The plugin names the entry after
        // its path (`src/project`); flatten it.
        entryFileNames: chunk => `${chunk.name.split('/').pop()}.js`,
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
