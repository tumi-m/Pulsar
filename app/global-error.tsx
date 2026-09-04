"use client";

/**
 * Root-level error boundary — catches what route `error.tsx` cannot
 * (layout / shell failures). Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className="bg-void min-h-screen text-star-white"
        style={{ backgroundColor: "#04040a", color: "#e8e8f4" }}
      >
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Pulsar</h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] opacity-60">
            Something skipped
          </p>
          <p className="max-w-sm text-[13px] leading-relaxed opacity-70">
            The app hit a critical error. Trying again usually clears it.
          </p>
          <button
            onClick={reset}
            className="mt-2 min-h-[44px] rounded-full bg-white px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-black"
          >
            Try again
          </button>
          {error.digest && (
            <p className="mt-4 font-mono text-[10px] opacity-40">ref: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
