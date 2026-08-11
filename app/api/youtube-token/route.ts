import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Exchanges a Google OAuth authorization code for an access token.
 *
 * This route exists because Google **deprecated the implicit flow** — issuing a
 * token straight to the browser via `response_type=token` is no longer
 * supported for new integrations. The supported path is Authorization Code +
 * PKCE, and Google's "Web application" client type requires the client secret
 * on the token exchange. A secret can never live in the browser bundle, so the
 * exchange happens here instead.
 *
 * Server-only env:
 *   GOOGLE_CLIENT_SECRET  — from the same OAuth client as the public client id
 *
 * Returns { access_token, expires_in } and nothing else — the refresh token is
 * deliberately not forwarded to the client.
 */

export async function POST(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "YouTube export is not configured on the server." },
      { status: 404 }
    );
  }

  let body: { code?: string; verifier?: string; redirectUri?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { code, verifier, redirectUri } = body;
  if (!code || !verifier || !redirectUri) {
    return NextResponse.json(
      { error: "code, verifier and redirectUri are all required." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      // Google's error bodies are actually useful here (redirect_uri_mismatch,
      // invalid_client, …) so pass the reason through rather than a bare 500.
      return NextResponse.json(
        { error: data.error_description || data.error || "Token exchange failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in ?? 3600,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Google." }, { status: 502 });
  }
}
