# Pulsar — Production baseline (P0 "before")

Captured 2026-07-28 against the production deploy `pulsar-ten-sigma.vercel.app` (Vercel,
branch `main`). Later phases compare against these numbers to prove improvement.

All measurements are real, captured from this environment. Lighthouse was run with
locally-installed Chromium (`/usr/bin/chromium`, installed via `apt`) against the live
prod URL, no throttling overrides beyond Lighthouse's built-in mobile preset.

---

## 1. Lighthouse — `/` (home / live feed)

### Mobile (form-factor: mobile, Lighthouse built-in mobile emulation)

| Category | Score |
|---|---|
| Performance | **37** |
| Accessibility | **96** |
| Best Practices | **93** |
| SEO | **100** |

| Metric | Value |
|---|---|
| LCP (Largest Contentful Paint) | **4.97 s** |
| FCP (First Contentful Paint) | 3.93 s |
| TBT (Total Blocking Time) | **4,375 ms** |
| TTI (Time to Interactive) | 11.95 s |
| CLS (Cumulative Layout Shift) | 0.010 |
| TTFB (Server Response Time) | 5 ms |
| DOM size (total nodes) | 3,106 |

### Desktop (Lighthouse `--preset=desktop`)

| Category | Score |
|---|---|
| Performance | **55** |
| Accessibility | **96** |
| Best Practices | **96** |
| SEO | **100** |

| Metric | Value |
|---|---|
| LCP | 1.60 s |
| FCP | 1.34 s |
| TBT | 879 ms |
| TTI | 3.49 s |
| CLS | 0.003 |
| TTFB | 4 ms |
| DOM size | 3,127 |

**Takeaways:** mobile performance is far below the P5 target (≥90). The dominant
problems are TBT (4.4 s of main-thread blocking) and LCP (4.97 s), not network (TTFB
is ~5 ms from Vercel's edge). The `/experience` route (visualiser, three.js) is the
heaviest code path — see bundle section. CLS is already excellent (0.01) so layout
stability is not a P5 problem; LCP and TBT are.

---

## 2. Bundle report

Captured via `ANALYZE=true npm run build` (reports in `.next/analyze/`:
`client.html`, `edge.html`, `nodejs.html`). Route sizes from the build summary:

| Route | Size | First Load JS | Revalidate | Expire |
|---|---:|---:|---:|---:|
| `/` (home / live feed) | 36.2 kB | 200 kB | 5m | 1y |
| `/experience` (visualiser) | **229 kB** | **331 kB** | — | — |
| `/admin` | 2.09 kB | 148 kB | — | — |
| `/_not-found` | 995 B | 103 kB | — | — |
| `/api/*` (15 routes) | 152 B each | 103 kB | — | — |

- Shared First Load JS (all routes): **102 kB**
  - `chunks/255-*.js` 46.3 kB
  - `chunks/4bd1b696-*.js` 54.2 kB
  - other shared chunks 1.92 kB
- Build compiled successfully in **50 s**.
- Heaviest path: `/experience` at **331 kB First Load** — this is the WebGL
  visualiser pulling in `three`, `@react-three/fiber`, `@react-three/drei`. It is the
  single biggest bundle contributor and the primary P5 code-splitting target
  (`GpuVisual`, `WmpVisual`, `Visualizer` → `next/dynamic` with `ssr: false`).
- The home route is lean (200 kB First Load) — the mobile perf problem on `/` is
  execution cost (parsing/eval/hydration + the live-feed sweep), not raw bytes.

---

## 3. `getLiveFeed()` timing (build `[feed]` counters)

From the production build log:

```
[feed] deezer: 0 · apple: 200 · genres: 0 · africa: 0 · gospel: 0 · genreArtists: 0 · grammy: 0
[feed] real dates back-filled: 0/0 (missing 0)
```

- At **build time**, only the Apple Marketing Tools RSS feed is fetched (200 items).
  All other sources return 0: Deezer, the ~29 genre sweeps, the African/SA + gospel
  discographies, and the Grammy-winner discographies.
- This means the home route's ISR revalidation (every 5m) rebuilds the feed live on
  the server, bounded by a 20s wall-clock budget. Cold-cache visitors pay the full
  sweep cost; warm visitors get the 5m-cached snapshot.
- A true cold-vs-warm `getLiveFeed()` wall-clock comparison requires running the
  ingest/feed against live APIs with network access at runtime; in the build sandbox
  only Apple RSS produced rows. **P3** (persisting the sweeps to Supabase) is the fix
  that makes this number meaningful and stable.

---

## 4. Verification gate baseline (before P1)

The P0 gate is `npx tsc --noEmit && npm run lint && npm run build` (`npm test` does not
exist until P1). All three pass at P0 completion:

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (one Tailwind ambiguity warning: `ease-[cubic-bezier(0.22,1,0.36,1)]`)
- `npm run build` — success (50 s)

`npm test` — **not yet defined** (P1 adds it).