"use client";

import { motion } from "framer-motion";

/**
 * Calabi–Yau manifold mark — a stylized cross-section of the 6-fold
 * curved geometry used in string-theory visualizations. Interlocking
 * bezier "petals" in radial symmetry, slowly rotating. Replaces the
 * pulse dot next to the PULSAR wordmark.
 */
export function CalabiYau({ size = 20 }: { size?: number }) {
  const arms = 6;
  const petals = Array.from({ length: arms }, (_, i) => (i * 360) / arms);

  return (
    <motion.span
      className="relative inline-flex"
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      aria-hidden
    >
      <svg
        viewBox="-50 -50 100 100"
        width={size}
        height={size}
        fill="none"
      >
        <defs>
          <linearGradient id="cy-grad" x1="0" y1="-50" x2="0" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e8e8f4" />
            <stop offset="55%" stopColor="#9b5de5" />
            <stop offset="100%" stopColor="#00d4ff" />
          </linearGradient>
        </defs>

        {/* outer manifold shell — warped petals */}
        {petals.map((deg) => (
          <path
            key={`o-${deg}`}
            d="M0 -46 C 22 -30 22 -8 0 4 C -22 -8 -22 -30 0 -46 Z"
            transform={`rotate(${deg})`}
            stroke="url(#cy-grad)"
            strokeWidth="1.6"
            opacity="0.85"
          />
        ))}

        {/* inner lattice — offset half a step for the interlocked look */}
        {petals.map((deg) => (
          <path
            key={`i-${deg}`}
            d="M0 -28 C 13 -18 13 -3 0 5 C -13 -3 -13 -18 0 -28 Z"
            transform={`rotate(${deg + 30})`}
            stroke="url(#cy-grad)"
            strokeWidth="1.3"
            opacity="0.55"
          />
        ))}

        {/* core */}
        <circle r="3.2" fill="url(#cy-grad)" />
      </svg>
    </motion.span>
  );
}
