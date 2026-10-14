-- Pulsar — migration 0003: search indexes + case-insensitive identity.
--
-- 1. (lower(artist), lower(title)) unique index — the app's dedupe checks
--    (releaseExists, seed script) are case-insensitive (.ilike), but the old
--    `unique (artist, title)` constraint was case-sensitive, so
--    "The Beatles" vs "the beatles" upserted a second row forever.
-- 2. Trigram indexes for server search — the leading-% .ilike patterns in
--    searchReleases() bypass text_pattern_ops; pg_trgm GIN serves them.
-- 3. The composites the queries actually sort/filter on.
--
-- Safe to re-run. Run the SQL editor statements in order on your Supabase
-- project (or via `supabase db push` if you use the CLI).

-- ── Case-insensitive release identity ────────────────────────────────
-- Dedupe existing case-variant duplicates first: keep the OLDEST row of
-- each (lower(artist), lower(title)) group.
delete from releases r
using releases keeper
where r.id <> keeper.id
  and lower(r.artist) = lower(keeper.artist)
  and lower(r.title) = lower(keeper.title)
  and (keeper.created_at, keeper.id) < (r.created_at, r.id);

drop index if exists releases_artist_title_lower_uidx;
create unique index releases_artist_title_lower_uidx
  on releases (lower(artist), lower(title));

-- The plain (artist, title) unique constraint predates case-awareness and is
-- now redundant (the lower() index subsumes it). Drop it so upserts only
-- target the case-insensitive index.
alter table releases
  drop constraint if exists releases_artist_title_key;

-- saveRelease() must now target the expression index:
--   .upsert({...}, { onConflict: "lower(artist),lower(title)" })  — not
--   possible via supabase-js; instead the client dedupes case-insensitively
--   BEFORE upserting with onConflict artist,title. See lib/supabase.ts.

-- ── Trigram indexes for /api/search ──────────────────────────────────
create extension if not exists pg_trgm;

drop index if exists releases_artist_trgm_idx;
create index releases_artist_trgm_idx
  on releases using gin (artist gin_trgm_ops);

drop index if exists releases_title_trgm_idx;
create index releases_title_trgm_idx
  on releases using gin (title gin_trgm_ops);

drop index if exists releases_genre_trgm_idx;
create index releases_genre_trgm_idx
  on releases using gin (genre gin_trgm_ops);

-- ── Query-shape composites ───────────────────────────────────────────
-- getReleases orders by (release_date desc, created_at desc)
drop index if exists releases_date_created_idx;
create index releases_date_created_idx
  on releases (release_date desc, created_at desc);

-- Genre faceting
drop index if exists releases_genre_idx;
create index releases_genre_idx on releases (genre);

-- pullCollection orders favorites by added_at per user
drop index if exists favorites_user_added_idx;
create index favorites_user_added_idx
  on favorites (user_id, added_at desc);