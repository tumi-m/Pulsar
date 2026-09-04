/** Timing-safe string comparison for secret checks. */

/**
 * Constant-time string comparison (no early exit on the first mismatch).
 * Length differences can't be hidden, but the content comparison still runs
 * over the longer input so the timing profile stays flat.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still burn a comparison to keep timing flat, then fail.
    let sink = 0;
    for (let i = 0; i < b.length; i++) {
      sink |= a.charCodeAt(i % Math.max(1, a.length)) ^ b.charCodeAt(i);
    }
    void sink;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}