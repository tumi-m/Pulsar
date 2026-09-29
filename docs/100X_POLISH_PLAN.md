# PULSAR — 100x Polish Build Plan (Premium Minimal, Vercel)

Locked decisions: **Premium minimal** (artwork-first, neon as accent) · **Look & feel first** · **Playback phased** (perfect 30s previews → full SDK) · **Vercel standard**.

## Wave 0 — Foundations [DONE — verified tsc/lint/217 tests/build]
- [x] Audit: 39 components (~23k lines), 15 API routes, design tokens defined but bypassed
- [x] Vercel: `GET /api/agent?secret=` triggers ingest (crons send GET), `maxDuration=300`, `runtime=nodejs`.
- [x] `next.config.ts`: `avif/webp`, `minimumCacheTTL`, `**.bcbits.com`, `lh3.googleusercontent.com`, dropped `experimental:{}`.
- [x] `app/api/releases`: `edge` → `nodejs`, clamp `limit 1..100`, validate `mood/date`.
- [x] `lib/supabase.ts`: Proxy `catch/finally` fix; `searchReleases` escapes `%_\`; limits clamped.
- [x] `app/layout.tsx`: `metadataBase`, skip-link, `main#main`.
- [x] Added `loading.tsx`, `not-found.tsx`, `global-error.tsx`, `sitemap.ts`, `robots.ts`.
- [x] `app/error.tsx`: namespaced storage clear. `package.json`: `typecheck` script.

## Wave 1 — Design system (premium minimal) [PARTIAL]
- [x] Typography: `next/font` Inter (display 700/800 + body) + Space Mono; removed render-blocking `@import`/preconnect; `.eyebrow` canonical label; `.text-balance`.
- [x] Hero: `px-5/md:px-10` rhythm, `font-display`, eyebrow sub at `/60` (was `/45` + `0.4em` sprawl). Verticals untouched (coupled to search pill offset).
- [x] Card: `rounded-xl` token, FOR YOU badge → quiet dot, artist caption `/70`.
- [x] Release page: `next/image` 480 + `sizes` + priority, eyebrow labels, title sentence-case + balance, artist `/70`, JSON-LD `MusicAlbum`.
- [x] GenreFilter: `min-h-[36px]` targets, `aria-pressed`, gap rhythm.
- [x] Imagery: YT thumbs `loading=lazy`. Deleted dead `ReleaseModal.tsx` (272l).
- [ ] Remaining (Wave 2): full z-ladder remap, sheet/Detail token pass, search-pill coupling + grid split, 44px DSP targets, ambient-layer gating.

## Wave 1 — Design system (premium minimal)
- Typography: `next/font` (display+body+mono kept), fluid scale, one eyebrow `11px mono caps 0.22em`, sentence-case body, `text-balance`.
- Color: ink-first, neon 1-accent/view, body text ≥70% (today 45-60% fails WCAG), DSP colors only in `platforms.tsx`.
- Spacing: 4/8pt grid (`4/8/12/16/24/32/48/80`), kill `px-[21px] pb-[132px]`.
- Radius/border/z/glass → tokens in `globals.css:7-32` (`--radius-*`, `--z-*`, `.glass/*`). Delete `ReleaseModal.tsx` (dead 272l).
- Imagery: `Artwork.tsx` pattern everywhere, `next/image` + blur + sizes, YT `hqdefault` → lazy + higher res.

## Wave 2 — Page-by-page
- Shell: ambient layers (`ThemedBackground`+`ParticleField`+`FloatingObjects`+`Bubbles`) → home-only, `dynamic ssr:false`, reduced-motion gate.
- Navbar: sticky blur, 44px targets (today `h-6/h-7`), unhide Shuffle/Selector (2s dwell undiscoverable).
- Hero: `pt-24 pb-12`, one gradient line, editorial count line.
- Grid (`ReleaseGrid 942l` god-component): split `SearchBar/FilterBar/GridSections`, sticky `top-14`, real spinner, `.skeleton` tiles (defined, never used), empty CTA, keyboard pinch.
- Card (`349l`): play on hover/focus, single `···` menu, dot not badge for FOR YOU, kill global `whileTap 0.95`.
- Detail (`887l`): one sheet pattern, 44px rows, `Promise.all` batch (today waterfall), focus-trap, `aria-modal=true`.
- Player-A (now): queue, MediaSession, crossfade, `Range` passthrough, retry UI.
- Release page: JSON-LD `MusicAlbum`, OG, related, blur image.
- Samples/AI: route them (`/selector`), skeletons, no raw JSON errors. Admin gated.

## Wave 3 — Bugs P0/P1 (alongside polish)
P0: ISR 25-60s/revalidate → move sweeps to ingest; sync delete-all+reinsert → upsert+merge; LLM `/api/ask` auth+rate-limit; 2000 RSC 1.5-3MB → SSR 60 + server search.
P1: `citext`+trigram+`popularity/label` cols; preview scorer strict; `Range`; unify IDs (double-hash in `feed.ts:78-92` vs single in `artist/route.ts:39-44`); drop `1900-01-01` sentinels; UTC-today → user-tz.
P2: track/album `${id}#${track}` identity, YT scrape fallback, lyrics throttle, artwork resize cap, `formatDate` guard, `GENRE_RULES` order, `listen_history` TTL+opt-out.

## Wave 4 — Features (after polish)
- Quick: server search+facets+did-you-mean, Command-K, shareable OG + `next/og`, toasts+undo, PWA 192/512 PNG (today SVG-only).
- Playback-B: Spotify refresh (1hr expiry kills 100-track builds), Apple MusicKit export (`/api/apple-token` exists, no path).
- Moat: Selector v2 pgvector grounded, Daily Mix/Radar from `taste.ts` (today tile-size only), sample-chain radio.
- Defer: light mode v1, Observatory expansion, social/library, Stripe.

## Gates
`npx tsc --noEmit && npm run lint && npm run build && npm test` · Lighthouse ≥90 mobile · RSC <300KB · axe clean · Chromium+WebKit+mobile viewport.

Refs: `docs/IMPROVEMENT_PLAN.md` (P0-P12), `app/page.tsx:8,69`, `lib/feed.ts:244-458`, `lib/sync.ts:93-168`, `PlayerProvider.tsx:225-316`, `supabase/schema.sql:31`.
