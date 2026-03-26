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
-- Seed data — 5 example releases for day-one testing
-- ─────────────────────────────────────────────
insert into releases (
  artist, title, type, artwork_url, release_date,
  genre, tags, mood,
  spotify, apple_music, tidal, soundcloud, youtube_music,
  curator_note
) values
(
  'James Blake',
  'Paper Envelope',
  'single',
  'https://i.scdn.co/image/ab67616d0000b273placeholder1',
  current_date,
  'Electronic / Soul',
  array['electronic', 'soul', 'future-r&b'],
  'melancholic',
  'https://open.spotify.com/track/placeholder1',
  'https://music.apple.com/placeholder1',
  'https://tidal.com/browse/track/placeholder1',
  'https://soundcloud.com/jamesblake/placeholder1',
  'https://music.youtube.com/watch?v=placeholder1',
  'Glacial piano pools beneath a voice that sounds like grief learning to float.'
),
(
  'Floating Points',
  'Cascade Theory',
  'album',
  'https://i.scdn.co/image/ab67616d0000b273placeholder2',
  current_date,
  'Electronic / Jazz',
  array['electronic', 'jazz', 'ambient'],
  'hypnotic',
  'https://open.spotify.com/album/placeholder2',
  'https://music.apple.com/placeholder2',
  'https://tidal.com/browse/album/placeholder2',
  'https://soundcloud.com/floating-points/placeholder2',
  'https://music.youtube.com/playlist?list=placeholder2',
  'Like watching light refract through deep water — disorienting, gorgeous, total.'
),
(
  'Ethel Cain',
  'Crushed Glass',
  'single',
  'https://i.scdn.co/image/ab67616d0000b273placeholder3',
  current_date,
  'Art Pop / Gothic',
  array['art-pop', 'gothic', 'americana'],
  'cinematic',
  'https://open.spotify.com/track/placeholder3',
  'https://music.apple.com/placeholder3',
  'https://tidal.com/browse/track/placeholder3',
  'https://soundcloud.com/ethelcain/placeholder3',
  'https://music.youtube.com/watch?v=placeholder3',
  'A hymn written in exhaust fumes and stained glass. Her most visceral work yet.'
),
(
  'Yves Tumor',
  'Magnetic Meridian',
  'ep',
  'https://i.scdn.co/image/ab67616d0000b273placeholder4',
  current_date,
  'Avant-Pop / Noise',
  array['avant-pop', 'noise', 'psychedelic'],
  'energetic',
  'https://open.spotify.com/album/placeholder4',
  'https://music.apple.com/placeholder4',
  'https://tidal.com/browse/album/placeholder4',
  null,
  'https://music.youtube.com/playlist?list=placeholder4',
  'Genre as a concept is somewhere crying in a corner. Four tracks of pure frequency.'
),
(
  'Kelela',
  'Afterglow Drift',
  'single',
  'https://i.scdn.co/image/ab67616d0000b273placeholder5',
  current_date,
  'R&B / Club',
  array['r&b', 'club', 'experimental'],
  'euphoric',
  'https://open.spotify.com/track/placeholder5',
  'https://music.apple.com/placeholder5',
  'https://tidal.com/browse/track/placeholder5',
  'https://soundcloud.com/kelela/placeholder5',
  'https://music.youtube.com/watch?v=placeholder5',
  'The floor finds you before you find the floor. Kelela at maximum gravitational pull.'
)
on conflict (artist, title) do nothing;
