# Pulsar motion stack

Twenty open-source repos, picked by layer, each with one job in Pulsar. This is
the map: what each tool does here, where it lives, and how to run it. How to
*work* with the stack — the loop, the rules, which tool to reach for — is in
the `pulsar-motion` skill (`.claude/skills/pulsar-motion/SKILL.md`).

## The loop

**brief → design → animate → build → sound → render → review → ship**

| Stage | In Pulsar |
|---|---|
| Brief | `motion/briefs/TEMPLATE.md` → `motion/briefs/<name>.md` (example: `crate-recap.md`) |
| Design | tool-per-layer table in the `pulsar-motion` skill; tokens in `lib/motion.ts`, `remotion/tokens.ts`, `tailwind.config.ts` |
| Animate | Motion / GSAP / Anime.js / Rive / dotLottie / R3F / Remotion / Motion Canvas, below |
| Build | lazy loaders (`lib/gsapLoader.ts`, `lib/animeLoader.ts`, `components/three/lazy.ts`, `next/dynamic`) |
| Sound | `npm run motion:sfx` → `public/sfx/*`; `playSfx()` in `lib/sfx.ts`; Remotion `<Audio>` |
| Render | `npm run motion:render`, `npm run motion:explainers`, `next build` |
| Review | `npm run motion:review <file>` (ffprobe checks + contact sheet), Playwright at 390×844 / 1280×800 / reduced motion |
| Ship | `tsc`, `vitest`, `eslint`, `next build`, `test/e2e` |

The whole loop runs as a saved workflow — three competing designs judged
against the brief, build, sound, render, then three adversarial review lenses
with fix rounds, and a final gate that proposes (never makes) a commit:

```
Workflow({ name: "motion-loop", args: { brief: "motion/briefs/crate-recap.md" } })
```

## The twenty, by layer

### Agent skills — teach Claude Code the libraries

| # | Repo | In Pulsar |
|---|---|---|
| 2 | [remotion-dev/skills](https://github.com/remotion-dev/skills) | 11 skills in `.claude/skills/remotion-*` (router: `remotion-best-practices`) |
| 4 | [motiondivision/ai-kit](https://github.com/motiondivision/ai-kit) | `.claude/skills/motion` + Motion's hosted docs MCP servers in `.mcp.json` |
| 8 | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | 7 skills in `.claude/skills/gsap-*` |

All three are vendored at pinned commits by `scripts/motion/sync-agent-skills.mjs`
(`npm run motion:skills`, drift check `motion:skills:check`), security-reviewed,
with licences and caveats in `.claude/skills/THIRD_PARTY.md`. Pulsar's own
`pulsar-motion` skill sits on top and routes to them.

### Animation

| # | Repo | Job in Pulsar | Where |
|---|---|---|---|
| 5 | [motiondivision/motion](https://github.com/motiondivision/motion) | All UI motion: sheets, presence, layout, crate dock bump, tiles. Migrated from `framer-motion` to `motion/react`. | everywhere; tokens in `lib/motion.ts` |
| 6 | [greensock/GSAP](https://github.com/greensock/GSAP) | "How it was flipped" timeline on each sample pair: cable draws (DrawSVG), signal dot rides it (MotionPath), timings resolve (ScrambleText). | `lib/gsapLoader.ts`, `components/samples/*`, `components/SamplePage.tsx` |
| 7 | [juliangarnier/anime](https://github.com/juliangarnier/anime) | Sample lineage graph: new edges draw in, new nodes pop from their parent, ripple on expand. | `lib/animeLoader.ts`, `components/SampleGraph.tsx` |
| 9 | [rive-app/rive-wasm](https://github.com/rive-app/rive-wasm) | LCD display in the now-playing bar; `isPlaying` / `trackProgress` state-machine inputs and text runs driven by the player (≥1024 px). | `components/RiveDeck.tsx`, `public/rive/` (MIT asset + OFL font, see `NOTICE.md`) |
| 10 | [LottieFiles/dotlottie-web](https://github.com/LottieFiles/dotlottie-web) | Cassette "thinking" loader in the Selector, generated as shape-only Lottie in code. | `scripts/motion/build-lottie.ts` → `public/lottie/`, `components/TapeLoader.tsx` |

### 3D — `/experience`

| # | Repo | Job |
|---|---|---|
| 11 | [mrdoob/three.js](https://github.com/mrdoob/three.js) | renderer, geometry, canvas-drawn sleeves/discs/tapes |
| 12 | [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | the scene as React (`components/three/*`) |
| 13 | [pmndrs/drei](https://github.com/pmndrs/drei) | cameras, contact shadow, helpers |
| 14 | [pmndrs/react-three-rapier](https://github.com/pmndrs/react-three-rapier) | "dig the crate": the visitor's own records drop into a crate and can be flicked (`RecordsPhysics.tsx`; wasm loads only when the set-piece starts) |
| 15 | [pmndrs/react-postprocessing](https://github.com/pmndrs/react-postprocessing) | bloom, vignette, grain finish (`Finish.tsx`), skipped on low-tier devices (`lib/three/quality.ts`) |

### Assets

| # | Repo | Job |
|---|---|---|
| 16 | [svg/svgo](https://github.com/svg/svgo) | `svgo.config.mjs`; `npm run motion:svg`; `test/svg-optimized.test.ts` fails on any unoptimised SVG in `public/`; cards are optimised in `motion:cards` |
| 17 | [vercel/satori](https://github.com/vercel/satori) | JSX → SVG crate share card and video title cards: `lib/cards/*`, `POST /api/card`, Export → "Share card" |

### Sound

| # | Repo | Job |
|---|---|---|
| 18 | [goldfire/howler.js](https://github.com/goldfire/howler.js) | Opt-in interface sounds (menu → Interface sounds): transport key clicks, crate drop thunk, export chime/buzz. `lib/sfx.ts`; loads nothing until switched on; never touches the music player's `<audio>`. |

The sounds themselves are synthesised in code (`scripts/motion/build-sfx.mjs`)
and encoded by FFmpeg — no third-party audio.

### Render & export

| # | Repo | Job |
|---|---|---|
| 1 | [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | `CrateRecap` (1080×1920) in `remotion/`: previewed in the crate panel's Video sheet with `@remotion/player`, rendered on-device with `@remotion/web-renderer`, or from the CLI with `npm run motion:render`. Studio: `npm run motion:studio`. |
| 19 | [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | In-browser encoding: the visualiser's Record key captures the canvas (and sound on desktop) to MP4/H.264 or WebM/VP9 (`lib/clipRecorder.ts`); also the encoder under Remotion's web renderer. |
| 3 | [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) | "How sampling works" explainer — standalone project in `explainers/` (own package), built to `public/explainers/` and embedded in the Samples panel with the Motion Canvas player (`components/SampleExplainer.tsx`). |
| 20 | [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg) | Bundled with Remotion's compositor — `npx remotion ffmpeg` / `ffprobe`, no system install. Encodes the SFX, finishes Remotion renders, and powers `npm run motion:review`. |

## Commands

```bash
npm run motion:studio       # Remotion Studio
npm run motion:render       # CrateRecap → motion/out/crate-recap.mp4
npm run motion:review       # ffprobe checks + contact sheet → motion/out/
npm run motion:sfx          # regenerate public/sfx (deterministic)
npm run motion:lottie       # regenerate public/lottie/tape-loader.json
npm run motion:cards        # sample Satori cards → motion/out/cards
npm run motion:svg          # optimise SVGs in public/
npm run motion:explainers   # rebuild the Motion Canvas explainer
npm run motion:skills       # re-vendor agent skills at their pins
```

`motion/out/` is gitignored. Rendering headless on Linux needs a Chromium:
`REMOTION_BROWSER_EXECUTABLE` (Remotion) and `CHROMIUM_PATH`
(`explainers/scripts/render.mjs`) point at one.

## Budget

Nothing heavy is on the home page's first load. GSAP, Anime.js, Rive, Rapier,
postprocessing, Remotion, Howler, Satori, dotLottie, Mediabunny and the Motion
Canvas player all arrive by dynamic import when a listener reaches the feature.

## Licensing and caveats

- **Remotion** is free for individuals and companies of up to 3 people; larger
  for-profit companies need a [company licence](https://www.remotion.dev/license).
  The in-app web renderer reports each render to remotion.pro (origin,
  success/failure — no content); it uses `licenseKey: "free-license"`, which
  is only correct while you qualify for the free tier. With a company licence,
  set `NEXT_PUBLIC_REMOTION_LICENSE_KEY` to your public licence key and
  redeploy.
- **GSAP** is free including every plugin (standard licence since 3.13).
- **Mediabunny** is MPL-2.0 (used unmodified). **Rive** asset: MIT, with an
  embedded OFL font — `public/rive/NOTICE.md`. **Motion Canvas**: MIT — fonts
  and notice in `public/explainers/NOTICE.md`.
- The **Motion MCP servers** in `.mcp.json` need network access to
  `mcp.motion.dev`; Claude Code asks before using them.
- Remotion's CLI warns that zod 4.5.4 is expected; the app stays on zod 3 and
  compositions don't use zod schemas, so it's a warning only.
