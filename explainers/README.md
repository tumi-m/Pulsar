# explainers — Motion Canvas

Diagram-style explainers for Pulsar, made with [Motion Canvas](https://motioncanvas.io)
3.17. It's a standalone package with its own install and toolchain; the app's
`tsconfig.json` and ESLint config skip this directory.

There is one scene so far: **How sampling works** (`src/scenes/how-sampling-works.tsx`),
the card at the top of the Samples panel (`components/SampleExplainer.tsx`).
It runs ~29 s at 1920×1080 and 30 fps, in five beats:

| Beat | Time | What happens |
|---|---|---|
| Title | 0–1.4 s | Title over the original record. **Frame 0 is the poster** — with reduced motion the player sits here until someone presses play, so it must stay a complete picture. |
| 01 · The original | → ~5 s | A 1973 J-card and vinyl; a playhead plays the waveform up to the moment. |
| 02 · The cut | → ~8 s | Yellow highlight over the break, `2:14–2:18` timestamp and `88 BPM` tag; the slice lifts out. |
| 03 · The flip | → ~16 s | Pan to a 1994 song; the slice rides a dashed curve into bar 1, stretches to the bar, loops ×4; tags tween to `93 BPM` / `+2 ST`; drums arrive; a playhead flashes each repeat. |
| 04 · The chain | → ~21.5 s | The 1994 song's bars 2–3 are cut the same way and flipped into a 2016 track (`75 BPM`, `−3 ST`). |
| Close | → 28.6 s | The J-cards fold into sample-graph nodes with more branches: "Every record is a branch. / Dig the chain." |

## Edit

```bash
cd explainers
npm install
npm run dev        # the editor, at http://localhost:9000
```

The editor hot-reloads the scene as you save. It also writes `src/*.meta`
(settings, the scene's random seed, time events); commit those.

Scene rules, so it keeps working inside the app:

- **Legible at ~360 px wide.** That's a scale of about 0.19, so nothing that
  carries meaning is set below ~44 px. The sentence at the top does the
  explaining; the diagram only has to read as shapes.
- **Walkman palette and type only.** `src/palette.ts` restates the app's
  colours (this bundle never sees Tailwind). `src/fonts.ts` loads Inter
  600/800 and Space Mono 700 into the document for the canvas. The app's own
  copies come through `next/font` under hashed family names, which a canvas
  can't ask for. The scene starts with `yield fontsReady()` because text is
  measured when a node is created.
- **Deterministic.** No `Math.random()`: the waveform is a fixed function, so
  every render and every viewer see the same thing.

## Rebuild for the app

```bash
npm run motion:explainers        # from the repo root (= npm run build here)
```

This writes `public/explainers/`, which is committed. Today it's ~290 kB on
disk: one self-contained `project.js` of 220 kB (68 kB gzipped), the three
fonts at 65 kB, and `NOTICE.md` (copied from `public/` here, so edit it
here). `test/explainer-build.test.ts` checks that the output still fits
together. Rebuild and commit whenever `src/` changes.

### How the app plays it

`project.js` is the whole explainer: the scene, the `<motion-canvas-player>`
element (`src/player.ts`, which `src/project.ts` imports) and the single
copy of `@motion-canvas/core` the two share. The player is built here rather
than bundled by Next because the player package imports
`@motion-canvas/core` without depending on it, so that import can't resolve
from the app.

`SampleExplainer` imports `/explainers/project.js` with `webpackIgnore`, and
only when the card is opened, so none of this reaches the home page's
bundle. Then it creates the element with `src` pointing at the same URL, so
the element's own import is a module-cache hit. The card importing the file
itself means a failed download shows its Try again rather than the player's
own error box.

It's one file, not a player, a project and a shared chunk, because browsers
keep a failed module import for the life of the page. Try again has to ask
under a fresh URL (`?retry=1`, …), and a chunk imported by a relative path
would keep its old, failed URL whatever the entry was called. Keep the build
to one module; the build test fails if a chunk appears.

Quirks of the 3.17.2 player that the app works around:

- `quality`/`width`/`height` throw if set before the project has loaded.
  `src/player.ts` defers that call until the project is in, so the app can
  set `quality` up front, sized to the box.
- `auto="true"` ignores pause requests. The app pauses by removing `auto`
  and then calling the element's `setPlaying(false)`.
- The element can't be disposed. Each `Player` it makes subscribes to the
  project's module-level scene descriptions for good, so a new element per
  view would leak a whole player and scene graph (~29 MB) every time. The
  app makes **one** element per page and moves it in and out of the card.
  Detaching deactivates its `Player`, which stops the frame loop, and
  attaching wakes it again.
- A project that finishes loading after the element has been detached gets
  a `Player` that starts its frame loop in its constructor, after
  `disconnectedCallback` has already run. `src/player.ts` deactivates it if
  the element is no longer connected.

The app relies on the element's `setPlaying()`, its `player` (used only to
call `requestReset()` on reopen) and the two patched methods. Re-check all
of them when upgrading Motion Canvas. `test/explainer-build.test.ts` checks
that the patches are still in the built file.

## Render an MP4 (for social posts)

```bash
npm run render     # → output/how-sampling-works.mp4 (gitignored)
```

This starts the dev server, opens the editor in headless Chromium and
presses **Render**. The exporter saved in `src/project.meta` is
`@motion-canvas/ffmpeg` (H.264, 1920×1080, 30 fps, fast start), and the script
waits for the exporter to confirm FFmpeg has finished. Expect ~1.2 MB for
~29 s, in about a minute. It uses the app's Playwright (a root devDependency);
set `CHROMIUM_PATH` to use another Chromium. In the editor, the same thing is
**Video Settings → Render**.

Check a render with the bundled ffprobe from the root:
`npx remotion ffprobe explainers/output/how-sampling-works.mp4`.

## Add another explainer

Add `src/scenes/<name>.tsx` (`makeScene2D`) and add it to `scenes` in
`src/project.ts`, where it plays after the current one. A second project file
in the plugin's `project` option would be a second Vite entry. Rollup would
then split the core the two share into a chunk, which is the split the retry
above can't refetch. A separate explainer needs its own build (its own
`outDir`) to stay one file.
