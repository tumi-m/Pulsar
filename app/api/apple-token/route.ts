import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Mints an Apple Music developer token (a short-lived ES256 JWT) from a MusicKit
 * private key. Returns { token } so MusicKit JS can configure itself client-side.
 *
 * Requires (server-only) env from your Apple Developer account:
 *   APPLE_TEAM_ID       — your 10-char Team ID
 *   APPLE_KEY_ID        — the MusicKit key's Key ID
 *   APPLE_PRIVATE_KEY   — the .p8 private key contents (PEM, "\n" newlines ok)
 *
 * If any are missing the route 404s and the client falls back to CSV export.
 */

export const runtime = "nodejs";

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  let privateKey = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !privateKey) {
    return NextResponse.json({ error: "Apple Music not configured" }, { status: 404 });
  }
  // Allow the key to be stored with literal "\n" (common in dashboards).
  privateKey = privateKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60 * 12, // 12 hours (Apple allows up to 6 months)
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  try {
    // ieee-p1363 → raw r||s signature, which is the JOSE/JWT format ES256 needs.
    const signature = crypto.sign("sha256", Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
    const token = `${signingInput}.${b64url(signature)}`;
    return NextResponse.json(
      { token },
      { headers: { "Cache-Control": "private, max-age=3600" } }
    );
  } catch {
    return NextResponse.json({ error: "Failed to sign token" }, { status: 500 });
  }
}
