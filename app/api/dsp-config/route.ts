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

export async function GET() {
  return NextResponse.json(
    {
      spotifyClientId: pick("SPOTIFY_CLIENT_ID", "NEXT_PUBLIC_SPOTIFY_CLIENT_ID"),
      googleClientId: pick("GOOGLE_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID"),
      appleEnabled:
        process.env.APPLE_MUSIC_ENABLED === "true" ||
        process.env.NEXT_PUBLIC_APPLE_MUSIC_ENABLED === "true",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}