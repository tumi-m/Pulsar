# PULSAR — Findings Log

Running log of audit findings and their resolution status. Append per phase;
never delete entries — mark them `[x]` when fixed.

Basis: comprehensive audit of 2026-09-04 (repo @ 5271cea + local reconcile).

---

## Critical (security / data loss)

- [ ] **C1 — No rate limiting on any API route.** `/api/ask` fires paid Ollama
  calls unauthenticated; `/api/samples/chain` runs an unbounded BFS; `/api/apple-token`
  mints 12-h developer JWTs for anyone; `/api/preview/stream` is an unthrottled
  bandwidth proxy with `Access-Control-Allow-Origin: *`. (app/api/*)
- [ ] **C2 — SSRF via agent `fetch_page`.** `agent/tools.ts:313` fetches any
  model-supplied URL — prompt-injection → internal metadata endpoints. Only
  unvalidated fetch in the codebase.
- [ ] **C3 — Agent `save_release` persisted blind.** `agent/tools.ts:219` blind
  cast, no Zod; `supabase/schema.sql:23-27` bare text URL columns →
  `javascript:`/`data:` URIs can be stored and rendered (stored XSS).
- [ ] **C4 — Destructive collection sync.** `lib/sync.ts:93-122` delete-all →
  reinsert on every debounced change; non-atomic, failures swallowed; schema
  already has unique constraints for upsert-merge.
- [ ] **C5 — `getLiveFeed()` fan-out ~171→5,100 requests per cold render.**
  `enrichRealDates` (feed.ts:189) has no wall-clock deadline (up to 2,500
  fetches, conc 32); africa/gospel/genre-pages fan-outs are unbounded
  `Promise.all`s; page ISR (300s) vs fetch cache (1800s) mismatch.

## High (correctness)

- [ ] **H1 — Vercel cron auth mismatch.** vercel.json crons send
  `Authorization: Bearer $CRON_SECRET`, but app/api/agent/route.ts:7 checks
  `AGENT_TRIGGER_SECRET` → daily ingest may silently never run.
- [ ] **H2 — Agent secret in query string** (`?secret=`), raw `err.message`
  in 500 body, no middleware/security headers, no brute-force lockout.
- [ ] **H3 — PostgREST `or()` injection.** `lib/supabase.ts:163-169`
  interpolates user `q` into `.or(...)` — commas/parens inject filter clauses.
  Netlify cache-key collision: `/api/search` + `/api/releases` missing
  `Netlify-Vary: query`.
- [ ] **H4 — Case-sensitive `unique(artist,title)` vs `.ilike()` dedupe.**
  No citext → duplicate rows forever ("The Beatles" vs "the beatles").
- [ ] **H5 — Player context broadcasts elapsed/progress 4×/sec.**
  `PlayerProvider.tsx:168-174`; every `usePlayer()` consumer re-renders
  (memo doesn't protect against context updates) → all tiles re-render
  during playback.
- [ ] **H6 — Track-identity residuals.** Track display reuses album id
  (`ReleaseDetail.tsx:91`); shuffle `playedRef` keys on `cur.id`
  (`ReleaseGrid.tsx:333`); "Full album" opens the *track* as release
  (`NowPlayingBar.tsx:115`); dead `reqId` in `playDirect`
  (`PlayerProvider.tsx:293`); `/?play=` CTA never consumed
  (`app/release/[id]/page.tsx:168`).
- [ ] **H7 — Sub-44px touch targets.** TrackRow play/lyrics 24px, sample
  chip ~18px, FeatureReel dots 4-14px, DSP logo links 28px, visualiser
  controls 24px, CratePicker close ~16px.

## Medium

- [ ] RSC payload ~2,000 releases (~1.5-3 MB) on `/`; `/samples` ships ~700
  unbounded; no grid virtualization; `sizes`/`dateSections` recomputed every
  render (unstable `shown` identity, ReleaseGrid.tsx:411-434).
- [ ] Zero `next/dynamic` code-splitting (GpuVisual, WmpVisual, SamplePage,
  LyricsPanel, three/).
- [ ] No focus trap/Escape/focus-restore in any overlay; framer-motion
  ignores `prefers-reduced-motion`; pervasive `/25-40` white contrast failures.
- [ ] Silent `catch → null` everywhere (feed, sync, DSP, agent); no error
  tracker; no `/api/health`.
- [ ] Spotify OAuth: fixed `state="spotify"` (CSRF weakness); no refresh
  token; YouTube uses deprecated implicit flow; tokens in localStorage.
- [ ] Event bus drift: dead channels (`pulsar-visualizing`, `pulsar-close-detail`,
  `pulsar-search`, `pulsar-ai-mode-change`); 60ms `setTimeout` discography
  race (`ReleaseGrid.tsx:277-282`); polymorphic `pulsar-crate-open` payload
  (boolean vs string); AiChat per-row collection listeners (`AiChat.tsx:690`).
- [ ] Missing DB indexes: `title`, `genre`, composites
  `(release_date, created_at)`, `favorites(user_id, added_at)`; no trigram.
- [ ] No collection/taste schema migrations (silent data discard on version
  bump); legacy playlist migration re-triggers on empty crates
  (`lib/collection.ts:73-86`).
- [ ] `/api/samples/chain` has no `maxDuration` — can exceed 10s serverless
  default on cache miss.
- [ ] `/api/preview/stream` forwards upstream content-type verbatim with
  ACAO `*`; no `nosniff`.

## Low / hygiene

- [ ] 80 lint warnings (`any` in dsp/spotify.ts, unused test vars, etc.).
- [ ] Zod installed but unused; manual `.slice()` validation in routes.
- [ ] "Mr Eazi" duplicated in `AFRICA_ARTISTS` (lib/feed.ts:327,329).
- [ ] scripts/seed-music.ts N+1 existence checks + insert (no upsert); seeds
  only core 70, not the expansion catalogs.
- [ ] Dead code: SyncBridge re-exports (SyncBridge.tsx:77-79), CratePicker
  `tick` hack, dead event channels.
- [ ] SerpAPI key passed as URL query param (agent/tools.ts:277).
- [ ] No `docs/events.md` / `docs/design-system.md`.
- [ ] `uuid-ossp` extension legacy (PG ≥13 has `gen_random_uuid()`); no
  `updated_at` trigger on crates.

## Verified fixed (prior audits)

- [x] GpuVisual texture-after-teardown (disposed flag, GpuVisual.tsx:282)
- [x] TrackRow setState-after-unmount (cancelled flag, ReleaseDetail.tsx:100-120)
- [x] Tile-level `pulsar-collection-change` fan-out (shared external-store
  hook `useCollectionState`)
- [x] OnboardingQuiz 375×667 overflow (portalled, overflow-y-auto)
- [x] Album play/track toggle (title+artist heuristic in PlayerProvider —
  though residuals remain, see H6)
- [x] `/api/preview/stream` host allowlist correctly anchored
- [x] RLS policies on user tables (owner-scoped, crate_items subquery policy)

## Resolution plan

See the conversation plan: Phase 0 (reconcile — done @ 4e26435), Wave A
(rate limits, agent hardening, cron fix, non-destructive sync, feed bounds),
Wave B (player split, track identity, a11y, event bus), Wave C (grid
virtualization, payload caps, code splitting), Wave D (DB migration, search
injection, observability), Wave E (hygiene). Each fix checked off here.