import Link from "next/link";

/** Designed 404 — replaces Next's default blank screen. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <h1
        className="text-4xl font-bold tracking-tight md:text-6xl"
        style={{
          backgroundImage: "var(--grad-faceplate)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pulsar
      </h1>
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-ink/45">
        Off the charts
      </p>
      <p className="max-w-sm text-[13px] leading-relaxed text-ink/55">
        That page doesn&apos;t exist. Head back to today&apos;s drops.
      </p>
      <Link
        href="/"
        className="mt-2 inline-block min-h-[44px] rounded-full px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-deck transition-transform hover:scale-105 active:scale-95"
        style={{
          background: "var(--grad-transport)",
          boxShadow: "0 6px 18px rgba(242,102,44,0.4)",
        }}
      >
        Back to discovery
      </Link>
    </div>
  );
}
