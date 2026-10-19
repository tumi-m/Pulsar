---
name: pulsar-motion
description: Pulsar's motion-design stack and its loop (brief → design → animate → build → sound → render → review → ship). Use for any animation, motion graphics, video, explainer, 3D, generated asset or sound work in this repo — picking the right one of the 20 tools for the job, where each lives in Pulsar, the rules every motion change must follow (reduced motion, touch, lazy loading, bundle budget), and the commands to render and review output. Routes to the vendored remotion-*, gsap-* and motion skills for library detail.
---

# Pulsar motion stack

Twenty open-source tools, one per job. The map of what lives where is in
`docs/motion-stack.md`; this skill is how to work with it.

## The loop

Every motion piece — a UI transition, a recap video, an explainer — goes
through the same eight stages. For anything bigger than a one-line tweak, run
the saved workflow instead of doing it by hand:

```
Workflow({ name: "motion-loop", args: { brief: "motion/briefs/<name>.md" } })
# or a one-liner, and it writes the brief first:
Workflow({ name: "motion-loop", args: { brief: "a 15s vertical teaser of the Samples graph" } })
```

1. **Brief** — copy `motion/briefs/TEMPLATE.md`. Name the deliverable, where it
   appears, its duration/aspect, the feeling, and how you'll know it's done.
   A brief without acceptance criteria can't be reviewed.
2. **Design** — pick tools by layer (table below) and beats with timings
   *before* writing code. Reuse the tokens: `lib/motion.ts` (EASE, DUR,
   SPRING), the Walkman palette in `tailwind.config.ts` / `remotion/tokens.ts`,
   Inter + Space Mono.
3. **Animate** — read the library's vendored skill first (see Routing).
4. **Build** — wire it into the app or the composition; keep heavy libraries
   lazy (rules below).
5. **Sound** — `npm run motion:sfx` regenerates the tape SFX and the recap
   bed; UI sounds go through `playSfx()` from `lib/sfx.ts` (opt-in, never
   throws); videos use Remotion's `<Audio>` from `@remotion/media`.
6. **Render** — `npm run motion:render` (Remotion → MP4 via its bundled
   FFmpeg), `npm run motion:explainers` (Motion Canvas), `npm run build`
   (the app).
7. **Review** — `npm run motion:review <file>` ffprobes a render (codec, size,
   fps, duration, loudness, blank frames) and writes a contact sheet to
   `motion/out/` — look at it. For UI motion: Playwright screenshots at
   390×844 touch and 1280×800, plus `reducedMotion: "reduce"`; zero console
   errors; the `/` First Load JS line from `next build`.
8. **Ship** — `npx tsc --noEmit`, `npm test`, `npm run lint`, `next build`,
   the e2e specs; then commit.

## Pick the tool by layer

| Job | Use | Not |
|---|---|---|
| UI state changes, layout, presence, gestures | **Motion** (`motion/react`) | GSAP — two UI animation systems fight |
| Precise SVG / text / multi-step timelines | **GSAP** via `loadGsap()` in `lib/gsapLoader.ts` (DrawSVG, MotionPath, ScrambleText, SplitText — all free) | Motion keyframe soup |
| SVG path drawing, small staggered reveals | **Anime.js** via `loadAnime()` in `lib/animeLoader.ts` | GSAP just for one dash offset |
| Vector animation bound to app state | **Rive** (`@rive-app/react-canvas`, state-machine inputs) | hand-rolled canvas |
| Designer-made looping illustrations | **dotLottie** (`components/TapeLoader.tsx` pattern; generate shape-only Lottie in code like `scripts/motion/build-lottie.ts`) | GIFs/videos |
| 3D scenes | **Three.js** through **React Three Fiber** + **Drei**; physics with **React Three Rapier**; finish with **React Postprocessing** (`/experience`) | raw three in React |
| Clean SVGs | **SVGO** — `npm run motion:svg`, config in `svgo.config.mjs` (a test fails on unoptimised SVGs in `public/`) | committing editor exports |
| Generated cards / title frames | **Satori** — `lib/cards/*`, `POST /api/card`, `npm run motion:cards` | screenshots of DOM |
| Interface sound, fades | **Howler.js** behind `lib/sfx.ts` | `new Audio()` per click |
| Editable video from React | **Remotion** — `remotion/` (`CrateRecap`), Studio: `npm run motion:studio` | screen recordings |
| Encoding/conversion in the browser | **Mediabunny** (directly, or via `@remotion/web-renderer`) | uploading to a server |
| Diagrams and explainers | **Motion Canvas** — standalone project in `explainers/`, embedded with `@motion-canvas/player` | Remotion for a diagram |
| Final encode, resize, inspect | **FFmpeg** — `npx remotion ffmpeg` / `npx remotion ffprobe` (bundled; no system FFmpeg needed) | guessing from file size |

## Rules every motion change follows

- **Reduced motion is not optional.** Every animation has a
  `prefers-reduced-motion: reduce` form: final state, no travel. Motion:
  `useReducedMotion` from `lib/motion.ts`. GSAP: `gsap.matchMedia()`.
  Remotion: a `reducedMotion` render prop or static frame. R3F: skip the
  simulation, place bodies settled.
- **Touch.** No Motion `whileTap` and no focus-triggered reveals on anything
  tappable — they misroute touch clicks in this app (see
  `test/e2e/touch.spec.ts`). Press feedback is CSS `:active`. Motion writes
  `transform`, which wipes Tailwind `translate-*`: centre animated things with
  a flex wrapper.
- **Content first.** Never hide content until a lazy library arrives. Animate
  *from* the visible state, or skip the animation if the library is late.
- **Bundle budget.** The home route's First Load JS is ~310 kB. GSAP,
  Anime.js, Rive, Rapier (2 MB of wasm), postprocessing, Remotion, Howler,
  Satori, dotLottie, Mediabunny and the Motion Canvas player are never
  statically imported from anything the home page renders —
  `ReleaseGrid → SamplesExplorer → SamplePage → SampleGraph` and the player
  bar are all on `/`. Load them with `import()` at the moment of need or
  `next/dynamic({ ssr: false })`, and check the build's First Load line.
- **Clean up.** Kill timelines (`ctx.revert()`), cancel rAF, dispose WebGL
  geometries/materials, revoke object URLs, abort encoders on unmount.
- **Remotion compositions are frame-driven:** `useCurrentFrame()` +
  `interpolate`/`spring` only — no CSS animations, no `Date.now()`, no
  `Math.random()` without a seed (see `remotion-markup`).
- **Licensing.** Third-party assets need a verified licence and a NOTICE next
  to them (`public/rive/NOTICE.md` is the pattern). Remotion is free for
  individuals and companies of up to 3 people; larger companies need a
  company licence. Don't use the meme SFX linked from `remotion-markup/sfx.md`.

## Routing to the vendored skills

- Remotion anything → `remotion-best-practices` (routes to `remotion-markup`
  for composition code, `remotion-render` for rendering, `remotion-saas` for
  the in-app Player and browser rendering, `remotion-multimedia` for
  Mediabunny).
- GSAP → `gsap-core`, then `gsap-react` (cleanup), `gsap-timeline`,
  `gsap-plugins`, `gsap-performance`. Load GSAP through `lib/gsapLoader.ts`,
  not `useGSAP` (it imports gsap statically).
- Motion → `motion` (best practices, CSS springs, docs search through the
  Motion MCP server when it's connected).
- No vendored skill: Anime.js, Rive, R3F/Drei/Rapier/postprocessing,
  Satori, Howler, Mediabunny, Motion Canvas, SVGO — read the package README
  and types in `node_modules` before writing code; don't guess APIs.

## Commands

```bash
npm run motion:studio      # Remotion Studio on remotion/index.ts
npm run motion:render      # render CrateRecap → motion/out/crate-recap.mp4
npm run motion:review      # ffprobe checks + contact sheet for a render
npm run motion:sfx         # regenerate public/sfx/* (deterministic)
npm run motion:lottie      # regenerate public/lottie/tape-loader.json
npm run motion:cards       # sample Satori cards → motion/out/cards (SVGO'd)
npm run motion:svg         # optimise every SVG in public/
npm run motion:explainers  # build the Motion Canvas explainer → public/explainers
npm run motion:skills      # re-vendor the remotion/gsap/motion skills (then review the diff)
```
