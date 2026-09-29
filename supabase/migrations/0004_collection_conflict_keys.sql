-- Pulsar — migration 0004: conflict keys the sync client can actually name.
--
-- lib/sync.ts upserts favourites and crate items with
--   onConflict: "user_id,release->>'id'"   and   "crate_id,release->>'id'"
-- PostgREST's on_conflict takes COLUMN NAMES only; it cannot name a JSON
-- expression, so both upserts failed on every push and the errors went to
-- console.warn. Favourites and crate contents never reached the server.
--
-- The schema also declared those uniques as
--   unique (user_id, (release->>'id'))
-- inside CREATE TABLE, which Postgres does not accept: a table constraint
-- takes plain columns, and expressions need CREATE UNIQUE INDEX. On a fresh
-- install that statement fails; on an existing project whoever created the
-- tables had to work round it by hand, so the live state is unknown.
--
-- A stored generated column gives the release id a real column name, which
-- both a unique constraint and PostgREST can use. The client now upserts with
-- onConflict "user_id,release_id" / "crate_id,release_id".
--
-- Safe to re-run. Run in the Supabase SQL editor (or `supabase db push`).

-- ── favorites ────────────────────────────────────────────────────────
alter table favorites
  add column if not exists release_id text
  generated always as (release->>'id') stored;

-- Keep the newest copy of any duplicate before the constraint goes on.
delete from favorites f
using favorites keeper
where f.user_id = keeper.user_id
  and f.release->>'id' = keeper.release->>'id'
  and (f.added_at, f.id) < (keeper.added_at, keeper.id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'favorites_user_release_key'
  ) then
    alter table favorites
      add constraint favorites_user_release_key unique (user_id, release_id);
  end if;
end $$;

-- ── crate_items ──────────────────────────────────────────────────────
alter table crate_items
  add column if not exists release_id text
  generated always as (release->>'id') stored;

delete from crate_items i
using crate_items keeper
where i.crate_id = keeper.crate_id
  and i.release->>'id' = keeper.release->>'id'
  and (i.added_at, i.id) < (keeper.added_at, keeper.id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crate_items_crate_release_key'
  ) then
    alter table crate_items
      add constraint crate_items_crate_release_key unique (crate_id, release_id);
  end if;
end $$;
