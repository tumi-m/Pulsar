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
-- No seed data — the catalog is populated exclusively by the daily ingest
-- agent (agent/ingest.ts → npm run ingest), so every row is a real release
-- with real streaming links. The old placeholder seed rows (fake
-- ".../placeholder1" links) were removed; if they already exist in your DB,
-- drop them once:
--   delete from releases where artwork_url like '%placeholder%';
-- ─────────────────────────────────────────────
