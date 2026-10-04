import { HeroSection } from "@/components/HeroSection";

/**
 * Route loading state — instant skeleton so navigation never flashes blank.
 * Uses the canonical `.skeleton` shimmer from globals.css.
 */
export default function Loading() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Loading new music">
      <HeroSection />
      <section className="px-[13px] md:px-[21px]">
        <div className="grid grid-cols-2 gap-[13px] sm:grid-cols-3 md:gap-[21px] lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square rounded-2xl" />
          ))}
        </div>
      </section>
    </div>
  );
}
