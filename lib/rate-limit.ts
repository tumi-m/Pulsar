/**
 * Pulsar — in-process sliding-window rate limiter.
 *
 * Zero-dependency protection for the unauthenticated routes that do paid or
 * expensive work (Ollama chat, MusicBrainz BFS, Apple JWT minting, CDN
 * streaming proxy). Single-instance servers only — serverless replicas each
 * keep their own window, which still bounds per-instance abuse, and the CDN
 * cache absorbs most repeat traffic before the function runs.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface Bucket {
  /** Timestamps (ms) of accepted hits inside the window. */
  hits: number[];
  /** Last time the bucket was touched — used to reap stale buckets. */
  touched: number;
}

const buckets = new Map<string, Bucket>();

/** Cap on tracked keys so long random IPs can't grow memory unbounded. */
const MAX_BUCKETS = 10_000;

/** Reap buckets idle for over an hour. */
function reap(): void {
  const cutoff = Date.now() - 3_600_000;
  for (const [key, bucket] of buckets) {
    if (bucket.touched < cutoff) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Maximum hits per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the oldest hit ages out of the window. */
  retryAfter: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) reap();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [], touched: now };
    buckets.set(key, bucket);
  }
  bucket.touched = now;

  const cutoff = now - opts.windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= opts.limit) {
    const oldest = bucket.hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  return {
    ok: true,
    remaining: opts.limit - bucket.hits.length,
    retryAfter: 0,
  };
}

/**
 * Best-effort client identity: the x-forwarded-for chain's first hop (set by
 * Vercel/Netlify from the socket), falling back to x-real-ip, then a fixed
 * local key for bare dev runs.
 */
export function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/** 429 response with standard rate-limit headers. */
export function tooMany(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}

/**
 * Rate-limit guard for a route handler. Returns a 429 response when the
 * caller is over budget, or null to continue.
 */
export function guard(
  req: NextRequest,
  name: string,
  opts: RateLimitOptions
): NextResponse | null {
  const result = rateLimit(`${name}:${clientKey(req)}`, opts);
  if (result.ok) return null;
  return tooMany(result);
}