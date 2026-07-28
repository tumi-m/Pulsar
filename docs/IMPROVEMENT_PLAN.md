# Pulsar — Whole-App Improvement Plan

**Budget:** ~2,000,000 agent tokens
**Intended runners:** Claude Code, Kimi K3 (or any capable agentic coding model)
**Repo:** `tumi-m/Pulsar` · **Prod:** `pulsar-ten-sigma.vercel.app` (Vercel, deploys `main`)

---

## 0. How to use this document

Each phase is a **self-contained work package**: it states its own goal, the files it
touches, its acceptance criteria, and its token budget. Phases are ordered so that
earlier ones de-risk later ones — but only **P0 → P1 → P2** are strictly sequential.
After P2, phases can run in any order or in parallel across agents.

### Ground rules for the agent

1. **One phase per session.** Start a fresh context per phase. Read only the files the
   phase lists plus what they import. Do not read the whole repo.
2. **Verification gate — every phase must end green:**
   ```bash
   npx tsc --noEmit && npm run lint && npm run build && npm test
   ```
   A phase is not done until all four pass. `npm test` does not exist until P1 —
   until then, the first three are the gate.
3. **Ship in small PRs.** One PR per numbered task where practical, never more than
   one per phase. Squash-merge to `main`.
4. **Never widen scope silently.** If a task turns out to be blocked or wrong, finish
   everything else in the phase and write the problem into `docs/FINDINGS.md`.
5. **Do not invent data.** This app is built on keyless public APIs. If a data source
   can't supply something (e.g. exact sample timecodes), say so in the UI rather than
   fabricating it. This rule already governs `/api/samples`.
6. **Preserve the deploy loop.** `main` auto-deploys. Never leave `main` broken.

### Adapting to the runner

The budgets below assume a strong agentic model with a large context window and tool
use. If your runner has a smaller context, split each phase at its task boundaries —
every task is written to be independently executable. Reserve ~15% of any phase budget
for iteration; the numbers below already include that.

---

## 1. Where the codebase actually stands

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Framer Motion ·
Supabase (optional) · WebGL2 + Canvas 2D visualisers.

**Data (all keyless):** Deezer (releases, genres, artist discographies), Apple Marketing
Tools RSS (charts), iTunes Search (artwork proxy), MusicBrainz (sample relationships),
lyrics.ovh (lyrics), YouTube results scraping (videos / live performances).

**Working well**
- Live feed with ~29 genre sweeps, African/SA + gospel + Grammy-winner discographies.
- Spotify playlist creation (OAuth PKCE, no secret) — end-to-end functional.
- Multi-crate collection, taste profile, pinch-to-zoom grid with Photos-style date sections.
- Two visualiser engines: `GpuVisual` (WebGL2 shaders) and `WmpVisual` (Canvas 2D bars/waves/ambience).
- Sample breakdown + lyrics panels; DSP export with CSV fallback.

**Known weak points (this plan's targets)**
- **Zero automated tests.** No unit, integration, or E2E coverage anywhere.
- **No error boundaries** — one render throw blanks the page.
- **No observability** — failures are invisible unless a user reports them.
- Search is a client-side substring scan over an in-memory array.
- Supabase persistence is fragile and was silently failing until recently.
- Monetisation (the stated goal: $1/mo · $10/yr, $3/mo · $20/yr) is **not built at all**.
- Selector "AI" is a keyword matcher, not a model.
- Accessibility has never been audited.
- Outstanding defects carried from the internal audits — see **P2**.

---

## 2. Budget allocation

| Phase | Package | Tokens | Depends on |
|------:|---------|-------:|------------|
| P0 | Orientation & baseline capture | 50k | — |
| P1 | Test & CI foundation | 170k | P0 |
| P2 | Critical bug backlog | 140k | P1 |
| P3 | Data layer: Supabase + ingest hardening | 160k | P1 |
| P4 | Search & discovery quality | 180k | P1, P3 |
| P5 | Performance budget & Web Vitals | 170k | P1 |
| P6 | Accessibility (WCAG 2.2 AA) | 150k | P1 |
| P7 | DSP export hardening + Apple/Tidal | 170k | P1 |
| P8 | Monetisation: auth, billing, gating | 230k | P1, P3 |
| P9 | Selector AI upgrade | 170k | P1, P8 |
| P10 | SEO, sharing & PWA | 130k | P1 |
| P11 | Observability & resilience | 100k | P1 |
| P12 | Design-system consolidation | 110k | P1 |
| — | Integration, review & reserve | 70k | — |
| | **Total** | **2,000k** | — |

---

## P0 · Orientation & baseline capture — 50k

**Goal:** establish a measurable "before" so every later phase can prove improvement.

1. Write `docs/FINDINGS.md` — a running log every later phase appends to.
2. Capture a production baseline into `docs/baseline.md`:
   - Lighthouse (mobile + desktop) for `/`: performance, a11y, best practices, SEO.
   - Bundle report: `ANALYZE=true npm run build` (add `@next/bundle-analyzer` if absent).
   - Cold and warm `getLiveFeed()` timing from the build log's `[feed]` counters.
3. Inventory every `window` event name in use (there are ~12: `pulsar-detail-open`,
   `pulsar-crate-open`, `pulsar-nav-hidden`, `pulsar-ai-activate`, …) into
   `docs/events.md`. This informal event bus is load-bearing and undocumented.

**Acceptance:** the three docs exist and contain real numbers, not placeholders.

---

## P1 · Test & CI foundation — 170k

**Goal:** make every later phase verifiable. Nothing else should be built on an
untested base.

1. **Vitest + React Testing Library.** Add `npm test` / `npm run test:watch`.
2. **Unit tests** for pure logic, which is where the subtle bugs live:
   - `lib/utils.ts` — `genreBucket` ordering (specific buckets must beat generic;
     "afro house" → House, not Electronic), `formatDate`, `isToday`/`isYesterday`.
   - `lib/feed.ts` — `stableId` collision resistance, `mapDeezer` type mapping,
     dedup/merge precedence in `getLiveFeed`, Apple per-feed popularity ranking.
   - `lib/collection.ts` — crate CRUD, legacy `pulsar_playlist_v1` migration.
   - `lib/taste.ts` — `scoreRelease`, `tileSizes`.
   - `lib/dsp/spotify.ts` — `artistMatches`, and `urisForRelease` against a mocked
     `fetch` (album path, single fallback, 429 retry, 401/403 propagation).
   - `lib/supabase.ts` — `cleanUrl()` reduces `…supabase.co/rest/v1/` to the origin.
3. **Component tests** for the highest-risk interactions:
   - `useScrollLock` ref-counting with stacked overlays.
   - `ReleaseGrid` pinch → column mapping and clamping (2–8).
   - Date-section grouping thresholds (5=day, 6=month, 7+=year) and the
     "Latest-view-only" rule.
4. **Playwright E2E**, mocking all external hosts at the network layer:
   - load → grid renders; open album → tracklist; add to crate → appears in crate;
     export → CSV path; pinch (or the equivalent programmatic zoom) → date headers.
5. **CI workflow** `.github/workflows/ci.yml`: typecheck + lint + build + unit on every
   PR; E2E on PRs to `main`. Required for merge.

**Acceptance:** `npm test` green; CI blocks a deliberately-introduced regression;
≥60% statement coverage on `lib/`.

---

## P2 · Critical bug backlog — 140k

These are **confirmed** defects from prior audits, not speculation. Write a failing
test first for each, then fix.

1. **Album-track identity collision** — `components/player/PlayerProvider.tsx`.
   `playDirect(display, url)` is called with `{...release, title: track.title}`, so every
   track keeps the *album's* `id`. `play()`'s early-return compares only `id`, so playing
   the album after a track just toggles pause. Give track displays a unique id
   (`${release.id}#${track.number}`) and compare consistently.
2. **GL texture written after teardown** — `components/GpuVisual.tsx`. The cover
   `Image.onload` can fire after cleanup ran `gl.deleteTexture`. Null the handler /
   set a disposed flag in cleanup.
3. **Unguarded setState after unmount** — `TrackRow` in `components/ReleaseDetail.tsx`;
   the queued sample fetch resolves after the row unmounts. Add a `cancelled` flag.
4. **60+ duplicate window listeners** — each `ReleaseCard` subscribes to
   `pulsar-collection-change` and re-reads localStorage. Lift to one subscription
   (context or external store) and pass derived state down.
5. **Sub-40px touch targets** — tracklist play/lyrics buttons (24px), the sample chip,
   and `FeatureReel` dots (~4–14px, effectively untappable). Raise hit areas to ≥44px
   without changing visual size (padding or a pseudo-element expander).
6. **OnboardingQuiz overflow** — two stacked `aspect-[4/3]` cards exceed a 375×667
   viewport with no scroll; the second option can be unreachable. Add `overflow-y-auto`
   or shrink the mobile aspect ratio.

**Acceptance:** a regression test per item; all green; no visual regressions in E2E.

---

## P3 · Data layer: Supabase + ingest hardening — 160k

**Goal:** make persistence trustworthy, so the catalogue stops being rebuilt from
scratch on every render.

1. **Schema migrations** — move `supabase/schema.sql` to numbered migrations. Add
   indexes on `release_date`, `popularity`, `genre`, and a trigram index on
   `artist`/`title` for P4's search.
2. **Ingest robustness** — batch upserts (currently one row per request: slow and
   quota-hungry), exponential backoff, and a resumable cursor so a timeout doesn't
   discard the run.
3. **Persist the expensive sweeps.** The Grammy/genre-artist sweeps are re-fetched on
   ISR revalidation and bounded by a 20s wall-clock budget. Move them into the ingest
   job (15-min budget) and have the site read from Supabase, falling back to the live
   feed. This is the single biggest correctness+speed win available.
4. **Run health** — write every run to `agent_runs`; add `/api/health` reporting last
   successful ingest, row count, and staleness.

**Acceptance:** ingest saves ≥5,000 rows in one run; a forced mid-run failure resumes;
`/api/health` reflects reality.

---

## P4 · Search & discovery quality — 180k

**Goal:** search that works on a catalogue of tens of thousands.

1. **Server-side search** — `/api/search` backed by Postgres full-text/trigram, with
   typo tolerance and prefix matching. Keep the client filter as the offline fallback.
2. **Ranking** — combine text relevance, popularity, recency and taste affinity
   (`lib/taste.ts`). Document the weights in the route.
3. **Facets** — genre, decade, type, label as real query params so results are
   linkable/shareable.
4. **Debounce + cancellation** — `AbortController` per keystroke; never let an older
   response overwrite a newer one (the same stale-response class of bug already fixed
   in `ReleaseDetail`).
5. **Empty and error states** — "did you mean", zero-result suggestions.

**Acceptance:** p95 search latency <300ms on ≥20k rows; typo query returns the
expected artist; E2E covers search → open → play.

---

## P5 · Performance budget & Web Vitals — 170k

**Goal:** measurable mobile performance, enforced automatically.

1. **Budget in CI** — Lighthouse CI on PRs. Fail if mobile performance <85, LCP >2.5s,
   CLS >0.1, or the main bundle grows >10% versus baseline.
2. **Grid virtualisation** — with pinch-zoom now reaching 8 columns and infinite scroll
   at 60/page, the DOM grows unbounded. Virtualise the grid (windowing that respects
   the variable `col-span`/`row-span` tiles and the P39 date sections).
3. **Image pipeline** — audit `Artwork.tsx`; ensure correct `sizes` per breakpoint,
   AVIF/WebP, and that the raw `<img>` proxy fallback isn't downloading full-size
   images on phones.
4. **Code-split the heavy paths** — `GpuVisual`, `WmpVisual`, `SamplePage`,
   `LyricsPanel`, `Visualizer` should all be `next/dynamic` with `ssr: false`.
5. **Re-render audit** — `ReleaseGrid` re-renders its whole subtree on scroll state
   changes; memoise tiles and split scroll state into a context that only the search
   block consumes.

**Acceptance:** Lighthouse mobile ≥90; DOM node count flat while scrolling 500+ tiles;
budgets enforced in CI.

---

## P6 · Accessibility (WCAG 2.2 AA) — 150k

**Goal:** usable with a keyboard and a screen reader. Never audited to date.

1. **Automated** — `axe-core` in Playwright over: home, album sheet, crate, Selector,
   sample page, lyrics. Zero criticals.
2. **Focus management** — overlays must trap focus, restore it on close, and be
   reachable by keyboard. `Portal` (P33) makes this tractable; `useBackClose` already
   handles Escape/Back.
3. **Semantics** — the grid should be a list; date sections need headings (partly done);
   icon-only buttons need labels; the visualiser needs a text alternative.
4. **Motion & contrast** — `prefers-reduced-motion` is respected in CSS and
   `ParticleField`/`FloatingObjects`/`Bubbles`, but not everywhere in Framer Motion.
   Audit contrast — much UI is white at 25–45% opacity on dark, likely below 4.5:1.
5. **Touch targets** — finish what P2 starts; enforce ≥44px via an ESLint/test rule.

**Acceptance:** zero axe criticals; full keyboard walkthrough in E2E; contrast passes.

---

## P7 · DSP export hardening + Apple/Tidal — 170k

**Goal:** make export dependable, and widen real coverage.

1. **Resumable exports** — persist progress so a closed tab or expired token doesn't
   lose a half-built playlist; on reconnect, continue rather than restart.
2. **Token refresh** — Spotify PKCE supports refresh tokens; store and use one so a
   1-hour expiry stops interrupting long builds.
3. **Match quality** — surface ambiguous matches for confirmation instead of silently
   skipping; report unmatched tracks in the success card with a retry.
4. **Apple Music** — finish the MusicKit path (`/api/apple-token` exists). Requires a
   paid Apple Developer membership; if unavailable, document and skip cleanly.
5. **Tidal** — implement behind a feature flag pending developer approval.
6. **YouTube quota** — show remaining daily capacity before starting (a 47-track crate
   consumes ~70% of the 10,000-unit default).

**Acceptance:** a 100-track export survives a forced token expiry; unmatched tracks are
listed and retryable; providers stay behind capability checks.

---

## P8 · Monetisation: auth, billing, gating — 230k

**Goal:** the stated business model, built properly. Largest package — treat as three PRs.

1. **Accounts** — Supabase Auth (email + OAuth). Migrate localStorage crates/favourites
   to the account on first sign-in, **without data loss**; anonymous use must keep working.
2. **Billing** — Stripe Checkout + Customer Portal. Plans: **Plus** $1/mo · $10/yr;
   **Max** $3/mo · $20/yr. Webhooks → `subscriptions` table. Handle trials, dunning,
   cancellation, and reactivation.
3. **Entitlements** — one server-side `getEntitlements(userId)`. Gate:
   - Free: browse, crates, CSV export
   - Plus: native DSP playlist creation
   - Max: Selector AI credits (metered, with a visible balance)
   **Enforce server-side.** A client-only gate is trivially bypassed.
4. **Paywall UX** — non-punitive upgrade prompts at the moment of value (export click),
   not on load.

**Acceptance:** full signup → subscribe → entitlement → cancel cycle passes E2E against
Stripe test mode; entitlement checks are server-authoritative; anonymous users unaffected.

> **Note:** Stripe requires a real business entity and terms/privacy pages. Sequence
> that paperwork alongside this phase — it gates launch, not the code.

---

## P9 · Selector AI upgrade — 170k

**Goal:** replace the keyword matcher with something worth charging for.

1. **Real model** — route Selector through an LLM (Claude via `@anthropic-ai/sdk`,
   already a dependency) **server-side only**; never expose a key to the browser.
2. **Grounding** — give the model the actual catalogue via retrieval (embeddings in
   Supabase `pgvector`), not the raw list. Return real release IDs and **reject
   hallucinated ones** before rendering.
3. **Credits** — meter against the Max entitlement from P8; show remaining balance;
   fail gracefully at zero.
4. **Streaming + cost control** — stream responses; cap tokens per request; cache
   common queries.
5. **Keep the offline path** — the existing keyword matcher becomes the fallback when
   unauthenticated, out of credits, or the model is unavailable.

**Acceptance:** every returned release exists in the catalogue; credits decrement
correctly; the fallback engages cleanly; no key reachable from the client bundle.

---

## P10 · SEO, sharing & PWA — 130k

1. **Per-release routes** — `/release/[id]` with generated metadata, Open Graph images
   (`next/og`), and JSON-LD `MusicAlbum`. Currently everything is one route, so nothing
   is shareable or indexable.
2. **Sitemap + robots** for indexable release/artist/genre pages.
3. **Share targets** — deep links that open the right album, honouring `navigator.share`.
4. **PWA** — manifest, icons, installability; a service worker caching the shell and
   artwork so the crate is browsable offline.

**Acceptance:** a shared link opens the correct album with a rich preview; Lighthouse
SEO ≥95; app installs and the crate opens offline.

---

## P11 · Observability & resilience — 100k

1. **Error boundaries** — per route segment and around each overlay, with a recovery
   action. One throw currently blanks the page.
2. **Error reporting** — Sentry (or equivalent) for client and server, with release
   tagging and PII scrubbing.
3. **Structured API logging** — every `/api/*` route logs upstream status, latency and
   cache hits. Third-party sources (Deezer/MusicBrainz/lyrics.ovh) fail silently today.
4. **Upstream circuit breakers** — stop hammering a dead source; degrade visibly.
5. **Alerting** — notify on ingest failure and on error-rate spikes.

**Acceptance:** a thrown error shows a recoverable boundary and reaches Sentry; a
simulated Deezer outage degrades without a blank page.

---

## P12 · Design-system consolidation — 110k

**Goal:** the UI has grown organically across ~40 sessions. Consolidate without
redesigning.

1. **Tokens** — extract the repeated glass/gradient/shadow recipes into Tailwind theme
   tokens and a few utilities. `backdropFilter: blur(Npx) saturate(N%)` is duplicated
   dozens of times inline.
2. **Primitives** — `<Sheet>`, `<GlassPanel>`, `<IconButton>`, `<Pill>`. `Portal`,
   `useScrollLock`, `useBackClose`, `useIsTouch` already exist — compose them into
   `<Sheet>` so every overlay gets locking, back-handling and focus for free.
3. **Motion vocabulary** — standardise springs/easings into named constants.
4. **Document** — `docs/design-system.md` with usage examples.

**Acceptance:** ≥60% of inline `style={{...}}` glass recipes replaced; every overlay
uses `<Sheet>`; no visual diffs in E2E screenshots.

---

## 3. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Keyless APIs rate-limit or change shape | High | P11 circuit breakers; P3 persistence so the site isn't live-dependent |
| Spotify stays in Development mode (25-user cap) | Blocks launch | Start extension review during P7 |
| YouTube quota (~65 tracks/day total) | Feature unusable at scale | Request increase in P7; position as secondary |
| Apple Music needs paid membership | Phase may not complete | Documented as skippable in P7 |
| Stripe needs a legal entity | Blocks P8 launch, not code | Start paperwork in parallel |
| Virtualisation conflicts with variable tile spans + date sections | Medium | Prototype behind a flag first in P5 |
| localStorage → account migration loses crates | High, user-visible | Explicit migration tests in P8; never destructive |
| Grammy/Wikidata query times out | Low | Existing partial-result guard already refuses to overwrite |

---

## 4. Suggested execution order

**Wave 1 (sequential):** P0 → P1 → P2 — baseline, tests, known bugs.
**Wave 2 (parallel):** P3, P5, P11 — data, performance, resilience.
**Wave 3 (parallel):** P4, P6, P12 — search, accessibility, design system.
**Wave 4 (sequential):** P7 → P8 → P9 — export, money, AI.
**Wave 5:** P10 — SEO/PWA, once routes are stable.

---

## 5. Prompt template

```
You are working on Pulsar (Next.js 15 / React 19 / TypeScript), repo tumi-m/Pulsar.
Read docs/IMPROVEMENT_PLAN.md, then execute PHASE <N> ONLY.

Rules:
- Work on branch claude/<phase-slug>. Never commit to main.
- Read only the files the phase names, plus what they import.
- Write a failing test before each fix where a test is possible.
- Gate: npx tsc --noEmit && npm run lint && npm run build && npm test — all green.
- Do not widen scope. Log anything blocked or surprising in docs/FINDINGS.md.
- This app uses only keyless public APIs and must never fabricate data it
  cannot source. If a source can't supply something, say so in the UI.
- Open one PR with the acceptance criteria checked off in the body.

Token budget for this phase: <N>k. Report remaining budget when done.
```

---

## 6. Definition of done (whole plan)

- [ ] CI green on `main`; ≥60% coverage on `lib/`; E2E covers the core journeys
- [ ] Lighthouse mobile ≥90 performance, ≥95 SEO, zero axe criticals
- [ ] Catalogue served from Supabase with a healthy daily ingest
- [ ] Spotify export resumable and out of Development mode
- [ ] Subscriptions live, entitlements enforced server-side
- [ ] Selector AI grounded in the real catalogue, metered by credits
- [ ] Errors reported and recoverable; upstream outages degrade gracefully
- [ ] Releases individually shareable and indexable; app installable