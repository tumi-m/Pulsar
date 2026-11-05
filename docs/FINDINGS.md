# PULSAR — Findings Log

Running log of audit findings and their resolution status. Append per phase;
never delete entries — mark them `[x]` when fixed.

Basis: comprehensive audit of 2026-09-04 (repo @ 5271cea + local reconcile).

---

## Critical (security / data loss)

- [x] **C1 — No rate limiting on any API route.** `/api/ask` fires paid Ollama
  calls unauthenticated; `/api/samples/chain` runs an unbounded BFS; `/api/apple-token`
  mints 12-h developer JWTs for anyone; `/api/preview/stream` is an unthrottled
  bandwidth proxy with `Access-Control-Allow-Origin: *`. (app/api/*) *(verified rate limiting present across 6 lib/api files.)*
- [x] **C2 — SSRF via agent `fetch_page`.** `agent/tools.ts:313` fetches any
  model-supplied URL — prompt-injection → internal metadata endpoints. Only
  unvalidated fetch in the codebase. *(verified SSRF guard in agent/tools.ts:321.)*
- [x] **C3 — Agent `save_release` persisted blind.** `agent/tools.ts:219` blind
  cast, no Zod; `supabase/schema.sql:23-27` bare text URL columns →
  `javascript:`/`data:` URIs can be stored and rendered (stored XSS). *(verified zod schema in agent/tools.ts.)*
- [x] **C4 — Destructive collection sync.** `lib/sync.ts:93-122` delete-all →
  reinsert on every debounced change; non-atomic, failures swallowed; schema
  already has unique constraints for upsert-merge. *(verified lib/sync.ts:91 documents merge/upsert, never replace.)*
- [x] **C5 — `getLiveFeed()` fan-out ~171→5,100 requests per cold render.**
  `enrichRealDates` (feed.ts:189) has no wall-clock deadline (up to 2,500
  fetches, conc 32); africa/gospel/genre-pages fan-outs are unbounded
  `Promise.all`s; page ISR (300s) vs fetch cache (1800s) mismatch.
  *(verified lib/feed.ts:207 `DEADLINE = Date.now() + 10_000`.)*

## High (correctness)
- [x] **H1 — Vercel cron auth mismatch.** vercel.json crons send
  `Authorization: Bearer $CRON_SECRET`, but app/api/agent/route.ts:7 checks
  `AGENT_TRIGGER_SECRET` → daily ingest may silently never run. *(verified app/api/agent/route.ts reads CRON_SECRET.)*
- [ ] **H2 — Agent secret in query string** (`?secret=`), raw `err.message`
  in 500 body, no middleware/security headers, no brute-force lockout.
- [x] **H3 — PostgREST `or()` injection.** `lib/supabase.ts:163-169`
  interpolates user `q` into `.or(...)` — commas/parens inject filter clauses.
  Netlify cache-key collision: `/api/search` + `/api/releases` missing
  `Netlify-Vary: query`. *(verified lib/supabase.ts:222 strips %_\\,()"' before .or().)*
- [x] **H4 — Case-sensitive `unique(artist,title)` vs `.ilike()` dedupe.**
  No citext → duplicate rows forever ("The Beatles" vs "the beatles"). *(verified supabase/migrations/0002 + 0003 (trigram + case-insensitive identity).)*
- [x] **H5 — Player context broadcasts elapsed/progress 4×/sec.**
  `PlayerProvider.tsx:168-174`; every `usePlayer()` consumer re-renders
  (memo doesn't protect against context updates) → all tiles re-render
  during playback. *(verified transport split into its own context; NowPlayingBar reads hot values.)*
- [x] **H6 — Track-identity residuals.** Track display reuses album id
  (`ReleaseDetail.tsx:91`); shuffle `playedRef` keys on `cur.id`
  (`ReleaseGrid.tsx:333`); "Full album" opens the *track* as release
  (`NowPlayingBar.tsx:115`); dead `reqId` in `playDirect`
  (`PlayerProvider.tsx:293`); `/?play=` CTA never consumed
  (`app/release/[id]/page.tsx:168`). *(verified `${albumId}#${track}` identity in PlayerProvider.)*
- [x] **H7 — Sub-44px touch targets.** TrackRow play/lyrics 24px, sample
  chip ~18px, FeatureReel dots 4-14px, DSP logo links 28px, visualiser
  controls 24px, CratePicker close ~16px.

## Medium
 *(verified 21 min-h-[44px]/[48px]/h-11 targets across components.)*
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

---

## Motion pass (2026-09-27)

Pulsar is a music app whose interface never moved in time with the music, and
whose motion was ad hoc — three different spring constants across four panels,
and `prefers-reduced-motion` honoured only where an author happened to remember.

- [x] **M1 — No motion system.** Added `lib/motion.ts`: canonical easings,
  durations and one spring; `fadeUp`/`pop`/`staggerParent`/`sheet` variant
  factories; framer's `useReducedMotion` re-exported so there is exactly one
  such hook. Every factory takes `Reduced` and collapses to a non-moving
  variant, so a component gets reduced motion right by using the system rather
  than by remembering. 14 tests pin that contract, including that framer's
  pre-measurement `null` is treated as "motion allowed" (treating it as
  "reduce" would make every list render static and then jump).
- [x] **M2 — Nothing in the UI responded to audio.** `LevelMeter` draws a
  five-bar meter on a canvas from `AudioEngine`, over the transport artwork.
  Canvas + rAF so bars move without React re-rendering — a 4×/s context update
  was already found to re-render every tile (H5), and this must not add to it.
  Labelled "Live audio level" only when an analyser exists; on touch devices,
  where the Web Audio graph is deliberately skipped, it reads "Playback
  indicator" rather than implying a measurement.
- [x] **M3 — Adding to a crate had no visual consequence.** `flyToCrate()`
  arcs the artwork into the crate button (WAAPI on a cloned node, so a grid
  re-render or an unmount mid-flight can't break it), then recoils the button.
  Fires only on ADD — flying artwork to say "removed" would mislead. Navbar
  carries `data-crate-target` so the animation never imports the component.
- [x] **M4 — Selector results appeared all at once.** Grid is now a staggered
  container; per-item delay shrinks as the list grows so twelve results still
  finish inside ~400ms.

Verified in a real browser, both motion states:
  meter — motion allowed: canvas present and pixels changing; reduced: no
  canvas at all, five static bars.
  crate flight — motion allowed: ghost node created, animating, cleaned up;
  reduced: no ghost created.

### Still open after this pass

- [ ] Lint **warnings** remain (61). The zero-error gate passes; the warnings
  are mostly `any` in DSP clients and unused test bindings.
- [ ] Zod is used in `agent/tools.ts` only; API routes still hand-validate.
- [ ] "Mr Eazi" duplicate in `lib/feed.ts` is resolved (single occurrence), but
  the wider seed-script N+1 (`scripts/seed-music.ts`) is not.
- [ ] Samples still ship no timecodes and no pinned video ids — blocked on
  being able to reach youtube.com to verify an id, which no session so far has
  had. See `lib/samples-media.ts`.
- [ ] TIDAL provider remains unexercised against the live API (dormant until a
  client id is set, so it cannot regress anything).
