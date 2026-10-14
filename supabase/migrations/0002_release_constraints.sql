-- Pulsar — migration 0002: harden the releases table for agent-written rows.
--
-- The agent persists model output with the service-role key. These CHECKs are
-- the server-side guarantee that only https:// links and well-formed data
-- land in the database, regardless of what any client or model sends.
-- Safe to re-run (idempotent). Test the constraints with NOT VALID first so
-- pre-existing rows don't fail the migration, then validate.

-- ── URL scheme checks: https:// or NULL on every link/artwork column ──
alter table releases
  drop constraint if exists releases_artwork_https_chk,
  add constraint releases_artwork_https_chk
    check (artwork_url ~ '^https://') not valid;
-- (Postgres has no FOR in plain DDL — each column expanded below.)

alter table releases
  drop constraint if exists releases_spotify_https_chk,
  add constraint releases_spotify_https_chk
    check (spotify is null or spotify ~ '^https://') not valid;

alter table releases
  drop constraint if exists releases_apple_https_chk,
  add constraint releases_apple_https_chk
    check (apple_music is null or apple_music ~ '^https://') not valid;

alter table releases
  drop constraint if exists releases_tidal_https_chk,
  add constraint releases_tidal_https_chk
    check (tidal is null or tidal ~ '^https://') not valid;

alter table releases
  drop constraint if exists releases_sc_https_chk,
  add constraint releases_sc_https_chk
    check (soundcloud is null or soundcloud ~ '^https://') not valid;

alter table releases
  drop constraint if exists releases_ytm_https_chk,
  add constraint releases_ytm_https_chk
    check (youtube_music is null or youtube_music ~ '^https://') not valid;

alter table releases
  drop constraint if exists releases_bp_https_chk,
  add constraint releases_bp_https_chk
    check (boomplay is null or boomplay ~ '^https://') not valid;

-- ── Data-shape checks ──
alter table releases
  drop constraint if exists releases_release_date_sane_chk,
  add constraint releases_release_date_sane_chk
    check (release_date between '1900-01-01' and '2100-12-31') not valid;

alter table releases
  drop constraint if exists releases_artist_len_chk,
  add constraint releases_artist_len_chk
    check (char_length(artist) between 1 and 200) not valid;

alter table releases
  drop constraint if exists releases_title_len_chk,
  add constraint releases_title_len_chk
    check (char_length(title) between 1 and 300) not valid;

alter table releases
  drop constraint if exists releases_curator_note_len_chk,
  add constraint releases_curator_note_len_chk
    check (curator_note is null or char_length(curator_note) <= 600) not valid;

alter table releases
  drop constraint if exists releases_genre_len_chk,
  add constraint releases_genre_len_chk
    check (genre is null or char_length(genre) <= 80) not valid;