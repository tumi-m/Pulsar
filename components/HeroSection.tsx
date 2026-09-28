"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/useTheme";

/**
 * The Pulsar letterhead. Kept deliberately compact — the search bar (with its
 * rotating feature reel) floats in the reserved space below, so the header and
 * search read as one cohesive unit with no overlap.
 */
export function HeroSection() {
  const theme = useTheme();
  // When the album/tracklist panel opens (right half), re-center the Pulsar
  // letterhead over the visible left half.
  const [detailOpen, setDetailOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setDetailOpen((e as CustomEvent<boolean>).detail);
    const onSamples = (e: Event) => setSamplesOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener("pulsar-detail-open", on);
    window.addEventListener("pulsar-samples-open", onSamples);
    return () => {
      window.removeEventListener("pulsar-detail-open", on);
      window.removeEventListener("pulsar-samples-open", onSamples);
    };
  }, []);

  // Horizontal rhythm matches the nav (px-5/md:px-10); the generous bottom
  // padding reserves room for the floating search bar + feature reel so the
  // grid always starts below them. Verticals stay coupled to the search
  // pill's fixed top offset in ReleaseGrid — change them together.
  return (
    <section
      className={`px-5 pb-[132px] pt-[89px] text-center transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:px-10 md:pb-[140px] md:pt-[120px] ${
        detailOpen || samplesOpen ? "lg:pr-[50vw]" : ""
      }`}
    >
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        // `w-fit` matters more than it looks: background-clip:text samples the
        // gradient across the ELEMENT box, and this was `max-w-3xl` — 768px
        // wide for a 210px word. Only the middle quarter of the gradient ever
        // landed on a glyph, so both end stops were invisible at every size.
        className="text-balance mx-auto w-fit max-w-3xl font-display text-5xl font-bold tracking-tight md:text-7xl"
        style={{
          // backgroundImage, NOT the `background` shorthand. Assigning the
          // shorthand resets background-clip to border-box, and React rewrites
          // only the style keys whose values changed — so the first paint was
          // correct and the moment the stored theme arrived it set `background`
          // alone, wiping the clip. The wordmark became a solid gradient
          // rectangle with the text invisible, on every theme but the default.
          backgroundImage: theme.hero,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pulsar
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.9 }}
        className="eyebrow mx-auto mt-4 max-w-md text-ink/60"
      >
        Music discovery
      </motion.p>
    </section>
  );
}
