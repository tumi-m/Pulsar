"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into <body>, escaping any ancestor stacking context.
 *
 * This matters because the page content lives inside `<main class="relative
 * z-10">`, which creates a stacking context: an overlay rendered inside it can
 * never paint above the Navbar (z-40) or the now-playing bar (z-50), no matter
 * how high its own z-index is. Portalling to <body> lets an overlay's z-index
 * compete at the root, so full-screen sheets actually sit on top — and their
 * buttons stay clickable instead of being covered by the header.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
