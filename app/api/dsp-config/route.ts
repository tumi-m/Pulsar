import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/dsp-config
 *
 * Public DSP (streaming-service) client configuration, served at RUNTIME.
 *
 * Why: OAuth client ids used to be read from NEXT_PUBLIC_* build-time inlines,
 * so setting the variable in Vercel did nothing until a redeploy — the single
 * most common cause of Spotify's `INVALID_CLIENT` screen. This route reads the
 * current server env on every request (with a short CDN cache), letting the
 * client pick up a newly-set client id immediately.
 *
 * These values are not secrets: PKCE/implicit-flow client ids are designed to
 * live in public code (there is no client secret anywhere in this app).
 * The non-public names (SPOTIFY_CLIENT_ID, GOOGLE_CLIENT_ID) are accepted too
 * purely for convenience.
 */
function pick(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim().length > 0) return v.trim();
  }
  return "";
}

/**
 * Per-service readiness, with the NAMES of whatever is missing (never values).
 *
 * Client ids alone over-reported what worked: YouTube also needs
 * GOOGLE_CLIENT_SECRET for the server-side token exchange, and Apple needs the
 * three signing values for its developer token. With only the id set, the
 * export sheet offered the service, sent the user through a consent screen,
 * and failed on the way back. Now the sheet knows before anyone taps, and can
 * say exactly which setting is missing.
 */
function readiness() {
  const has = (n: string) => Boolean(process.env[n]?.trim());
  const spotify = pick("SPOTIFY_CLIENT_ID", "NEXT_PUBLIC_SPOTIFY_CLIENT_ID");
  const google = pick("GOOGLE_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  const tidal = pick("TIDAL_CLIENT_ID", "NEXT_PUBLIC_TIDAL_CLIENT_ID");
  const appleFlag =
    process.env.APPLE_MUSIC_ENABLED === "true" || process.env.NEXT_PUBLIC_APPLE_MUSIC_ENABLED === "true";
  const missing = (pairs: [boolean, string][]) => pairs.filter(([ok]) => !ok).map(([, n]) => n);
  return {
    spotify: missing([[Boolean(spotify), "SPOTIFY_CLIENT_ID"]]),
    youtube_music: missing([
      [Boolean(google), "GOOGLE_CLIENT_ID"],
      [has("GOOGLE_CLIENT_SECRET"), "GOOGLE_CLIENT_SECRET"],
    ]),
    tidal: missing([[Boolean(tidal), "TIDAL_CLIENT_ID"]]),
    apple_music: missing([
      [appleFlag, "APPLE_MUSIC_ENABLED=true"],
      [has("APPLE_TEAM_ID"), "APPLE_TEAM_ID"],
      [has("APPLE_KEY_ID"), "APPLE_KEY_ID"],
      [has("APPLE_PRIVATE_KEY"), "APPLE_PRIVATE_KEY"],
    ]),
  };
}

export async function GET() {
  const missing = readiness();
  return NextResponse.json(
    {
      spotifyClientId: pick("SPOTIFY_CLIENT_ID", "NEXT_PUBLIC_SPOTIFY_CLIENT_ID"),
      googleClientId: pick("GOOGLE_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID"),
      tidalClientId: pick("TIDAL_CLIENT_ID", "NEXT_PUBLIC_TIDAL_CLIENT_ID"),
      appleEnabled: missing.apple_music.length === 0,
      missing,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
