/**
 * SVGO — one config for every SVG Pulsar ships or generates.
 *
 * Used by `npm run motion:svg` (everything under public/, in place), by
 * scripts/motion/build-cards.tsx for the generated cards, and by
 * test/svg-optimized.test.ts, which fails CI when an SVG under public/ isn't
 * already in the shape this produces.
 *
 * SVGO 4's preset-default already leaves viewBox (removeViewBox) and <title>
 * (removeTitle) alone — both left the preset in v4 — and its removeDesc only
 * drops empty or editor-generated descriptions. The one accessibility gap left
 * is removeUnknownsAndDefaults, which strips `role` unless told otherwise, and
 * role="img" is what makes an inline SVG's <title> read as its name.
 */

/** @type {import("svgo").Config} */
const config = {
  // Repeat until nothing shrinks: a merge in one pass can open up a collapse in
  // the next. The CI check depends on a second run changing nothing (bar
  // cleanupIds re-lettering ids, which the test normalises).
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeUnknownsAndDefaults: { keepRoleAttr: true },
        },
      },
    },
  ],
};

export default config;
