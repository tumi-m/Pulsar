"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Without this, any throw during render or hydration replaces the entire page
 * with Next's bare "Application error: a client-side exception has occurred"
 * screen — no branding, no way back, and nothing logged. This at least keeps
 * the user in the product and gives them a recovery action.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console and in Vercel's logs via the digest.
    console.error("[pulsar] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <h1
        className="text-4xl font-bold tracking-tight md:text-6xl"
        style={{
          background: "linear-gradient(120deg, #ffe8c9 0%, #ff9d5c 22%, #ff5fa2 48%, #9b5de5 72%, #00d4ff 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pulsar
      </h1>
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-star-white/45">
        Something skipped
      </p>
      <p className="max-w-sm text-[13px] leading-relaxed text-star-white/55">
        The page hit an error while loading. Trying again usually clears it.
      </p>

      <div className="mt-2 flex flex-col items-center gap-2">
        <button
          onClick={reset}
          className="min-h-[44px] rounded-full px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(120deg, #9b5de5, #ff5fa2 60%, #ffb347)",
            boxShadow: "0 6px 18px rgba(155,93,229,0.4)",
          }}
        >
          Try again
        </button>
        <button
          onClick={() => {
            // Locally-stored state (a corrupt crate, a stale grid zoom) is a
            // plausible cause, so offer a clean slate as a last resort.
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch {
              /* storage unavailable */
            }
            window.location.href = "/";
          }}
          className="py-1 text-[10px] font-bold uppercase tracking-widest text-star-white/35 hover:text-star-white/70"
        >
          Reset saved data &amp; reload
        </button>
      </div>

      {error.digest && (
        <p className="mt-4 font-mono text-[10px] text-star-white/25">ref: {error.digest}</p>
      )}
    </div>
  );
}
