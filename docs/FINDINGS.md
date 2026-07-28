# Pulsar — Findings log

A running log every phase appends to. Newest entries at the bottom. Anything blocked,
surprising, or contradicting the plan goes here rather than widening scope silently.

---

## P0 — Orientation & baseline capture

### Window event bus is larger and partly dead-wired
The plan estimated "~12" custom `window` events. The actual count is **16** distinct
event names (see `docs/events.md` for the full inventory). There is **no helper /
EventBus wrapper** — every site calls `window.dispatchEvent(new CustomEvent(...))` and
`window.addEventListener(...)` directly.

Orphan / dead wiring found during the inventory:
- **Dispatched but never listened (2):** `pulsar-ai-mode-change` (`lib/settings.ts:22`),
  `pulsar-visualizing` (`components/ReleaseGrid.tsx:212`).
- **Listened but never dispatched (2):** `pulsar-close-detail` (`components/ReleaseGrid.tsx:242`),
  `pulsar-search` (`components/ReleaseGrid.tsx:243`).

### P2 item #4 ("60+ duplicate window listeners") is not supported by static analysis
The plan asserts each `ReleaseCard` subscribes to `pulsar-collection-change` and that
this produces 60+ duplicate listeners. Static analysis finds exactly **6** subscribers
to `pulsar-collection-change` (`ReleaseCard`, `FloatingDock`, `Sidebar`, `ReleaseGrid`,
`NowPlayingBar`, `AiChat`), each registering a single listener with proper
`removeEventListener` cleanup in its effect return.

If 60+ duplicates are observed at runtime, the more likely cause is **components
remounting** (HMR, or list re-renders re-running effects) rather than multiple static
`addEventListener` calls per component. **Action for P2:** confirm via a runtime
`addEventListener` count log *before* refactoring to a shared store, otherwise the
refactor may not address the real cause. The lift-to-a-store refactor is still
worthwhile (single source of truth, fewer localStorage re-reads) but the "60+"
justification should be verified, not assumed.

### Production baseline is poor on mobile (see docs/baseline.md)
- Lighthouse **mobile performance 37** (LCP 4.97s, TBT 4375ms, FCP 3.93s, TTI 11.95s).
  Target in P5 is ≥90. The gap is large; TBT and the `/experience` route (331 kB First
  Load, three.js / react-three) are the dominant contributors.
- Desktop performance 55; a11y 96; best-practices 93–96; SEO 100.
- DOM node count on first load is already ~3,100 — even before scrolling — which
  reinforces the P5 grid-virtualisation case.

### Build-time feed is essentially empty
`[feed] deezer: 0 · apple: 200 · genres: 0 · africa: 0 · gospel: 0 · genreArtists: 0 · grammy: 0`.
At build only Apple Marketing Tools RSS is fetched (200 items); the Deezer / genre /
African-SA / gospel / Grammy-artist sweeps return 0 at build time. This confirms the
P3 thesis: the catalogue is rebuilt live on each request/ISR revalidation and the
expensive sweeps are not persisted. The `/` route revalidates every 5m, so cold-cache
visitors pay the full sweep cost (bounded by the 20s wall-clock ISR budget).

### Environment limitation for Lighthouse
No Chrome/Chromium was present in the dev environment. Chromium was installed via `apt`
to run Lighthouse locally. **For P5's Lighthouse-CI-in-CI requirement**, the CI runner
will need a Chromium available (the existing `apt install chromium` step should be
added to `.github/workflows/ci.yml`, or use a browser-preinstalled runner image).
`lighthouse` and `@next/bundle-analyzer` were added as devDependencies; `next.config.ts`
now wraps the config in `withBundleAnalyzer` (enabled via `ANALYZE=true`).

### No ESLint config — `npm run lint` is a hollow pass (blocks P1 CI)
There is **no ESLint config** in the repo (no `.eslintrc*`, no `eslint.config.*`, no
`eslintConfig` key in `package.json`). `npm run lint` runs `next lint`, which — with no
config present — **prompts interactively** ("How would you like to configure ESLint?
Strict / Base / Cancel") and exits 0 without linting anything. This is a false green:
it will hang any non-interactive CI runner. **P1 must** create an ESLint config (e.g.
`eslint.config.mjs` using `@eslint/js` + `eslint-plugin-next` + the React/T-S hooks
plugins) and switch `lint` to a non-interactive ESLint CLI invocation, *before* relying
on the lint step in `.github/workflows/ci.yml`. Until then the "lint" gate is
effectively unenforced. `next lint` itself is deprecated (Next 16), so migrating to the
ESLint CLI is the right move regardless.