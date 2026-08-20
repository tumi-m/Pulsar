-- Pulsar — Music Discovery Agent
-- Supabase / PostgreSQL schema

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- releases table
-- ─────────────────────────────────────────────
create table if not exists releases (
  id            uuid primary key default uuid_generate_v4(),
  artist        text not null,
  title         text not null,
  type          text not null check (type in ('single', 'album', 'ep')),
  artwork_url   text not null,
  artwork_blur_hash text,
  release_date  date not null,
  genre         text,
  tags          text[] default '{}',
  mood          text check (mood in (
                  'euphoric', 'melancholic', 'energetic', 'ambient',
                  'raw', 'cinematic', 'hypnotic', 'tender'
                )),
  spotify       text,
  apple_music   text,
  tidal         text,
  soundcloud    text,
  youtube_music text,
  boomplay      text,
  curator_note  text,
  created_at    timestamptz default now(),

  unique (artist, title)
);

-- ─────────────────────────────────────────────
-- agent_runs table — audit log of every run
-- ─────────────────────────────────────────────
create table if not exists agent_runs (
  id               uuid primary key default uuid_generate_v4(),
  run_at           timestamptz default now(),
  releases_found   integer default 0,
  releases_saved   integer default 0,
  errors           text[] default '{}',
  duration_ms      integer,
  success          boolean default false
);

-- ─────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────
alter table releases enable row level security;
alter table agent_runs enable row level security;

-- Anyone can read releases
create policy "releases_public_read"
  on releases for select
  using (true);

-- Only service role can insert/update (agent uses service key)
create policy "releases_service_write"
  on releases for insert
  with check (auth.role() = 'service_role');

create policy "releases_service_update"
  on releases for update
  using (auth.role() = 'service_role');

-- agent_runs: service role only
create policy "agent_runs_service_all"
  on agent_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
create index if not exists releases_date_idx  on releases (release_date desc);
create index if not exists releases_mood_idx  on releases (mood);
create index if not exists releases_type_idx  on releases (type);
create index if not exists releases_artist_idx on releases (artist text_pattern_ops);

-- ─────────────────────────────────────────────
-- User collections — cross-device sync
--
-- The app stores crates/favorites in localStorage as an offline-first cache;
-- these tables are the durable mirror so a signed-in user keeps their
-- collection across devices. Releases are content-addressed (artist+title),
-- so each row stores the full release snapshot as jsonb — no FK to the
-- releases table (a user's crate can hold releases not yet ingested, and
-- ingest must never break a stored reference).
--
-- Auth uses Supabase's built-in auth.users (magic link / anonymous).
-- ─────────────────────────────────────────────

create table if not exists crates (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists crate_items (
  id         uuid primary key default uuid_generate_v4(),
  crate_id   uuid not null references crates (id) on delete cascade,
  release    jsonb not null,            -- full Release snapshot
  added_at   timestamptz default now(),
  unique (crate_id, (release->>'id'))   -- one copy of a release per crate
);

create table if not exists favorites (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  release    jsonb not null,            -- full Release snapshot
  added_at   timestamptz default now(),
  unique (user_id, (release->>'id'))
);

create table if not exists listen_history (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  release    jsonb not null,
  played_at  timestamptz default now()
);

alter table crates         enable row level security;
alter table crate_items    enable row level security;
alter table favorites      enable row level security;
alter table listen_history enable row level security;

-- Users see and manage ONLY their own rows.
create policy "crates_owner_all"      on crates         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "crate_items_owner_all" on crate_items    for all
  using (exists (select 1 from crates c where c.id = crate_id and c.user_id = auth.uid()))
  with check (exists (select 1 from crates c where c.id = crate_id and c.user_id = auth.uid()));
create policy "favorites_owner_all"   on favorites      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "listen_owner_all"      on listen_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists crates_user_idx        on crates (user_id);
create index if not exists crate_items_crate_idx  on crate_items (crate_id);
create index if not exists favorites_user_idx     on favorites (user_id);
create index if not exists listen_history_user_idx on listen_history (user_id, played_at desc);

-- ─────────────────────────────────────────────
-- No seed data — the catalog is populated exclusively by the daily ingest
-- agent (agent/ingest.ts → npm run ingest), so every row is a real release
-- with real streaming links. The old placeholder seed rows (fake
-- ".../placeholder1" links) were removed; if they already exist in your DB,
-- drop them once:
--   delete from releases where artwork_url like '%placeholder%';
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- Migrations for databases created before a column existed.
-- `create table if not exists` above is a no-op on an existing database, so a
-- new column has to be added explicitly or every write silently drops it.
-- ─────────────────────────────────────────────
alter table releases add column if not exists boomplay text;
