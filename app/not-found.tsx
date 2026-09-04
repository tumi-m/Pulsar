import Link from "next/link";

/** Designed 404 — replaces Next's default blank screen. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <h1
        className="text-4xl font-bold tracking-tight md:text-6xl"
        style={{
          background:
            "linear-gradient(120deg, #ffe8c9 0%, #ff9d5c 22%, #ff5fa2 48%, #9b5de5 72%, #00d4ff 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pulsar
      </h1>
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-star-white/45">
        Off the charts
      </p>
      <p className="max-w-sm text-[13px] leading-relaxed text-star-white/55">
        That page doesn&apos;t exist. Head back to today&apos;s drops.
      </p>
      <Link
        href="/"
        className="mt-2 inline-block min-h-[44px] rounded-full px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white transition-transform hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(120deg, #9b5de5, #ff5fa2 60%, #ffb347)",
          boxShadow: "0 6px 18px rgba(155,93,229,0.4)",
        }}
      >
        Back to discovery
      </Link>
    </div>
  );
}
