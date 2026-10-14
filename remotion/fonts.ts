import { continueRender, delayRender } from "remotion";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff2";
import inter900 from "@fontsource/inter/files/inter-latin-900-normal.woff2";
import spaceMono400 from "@fontsource/space-mono/files/space-mono-latin-400-normal.woff2";
import spaceMono700 from "@fontsource/space-mono/files/space-mono-latin-700-normal.woff2";

/**
 * Pulsar's typefaces for the CLI and Studio only.
 *
 * In the app, next/font has already loaded Inter and Space Mono into the
 * document the Player and the web renderer draw in. The Remotion bundle has
 * no next/font, so it registers the same faces from @fontsource (already a
 * dependency) under the plain family names tokens.ts falls back to. A frame
 * must not be captured in a fallback face, so rendering waits on them — what
 * @remotion/fonts' loadFont() does, which this project doesn't install.
 *
 * Imported only by remotion/index.ts: Next can't resolve a .woff2 import, and
 * the app doesn't need these.
 */
const FACES = [
  { family: "Inter", url: inter700, weight: "700" },
  { family: "Inter", url: inter900, weight: "900" },
  { family: "Space Mono", url: spaceMono400, weight: "400" },
  { family: "Space Mono", url: spaceMono700, weight: "700" },
];

if (typeof document !== "undefined" && typeof FontFace !== "undefined") {
  const handle = delayRender("Loading Inter and Space Mono");
  Promise.all(
    FACES.map(async ({ family, url, weight }) => {
      const face = new FontFace(family, `url(${url}) format("woff2")`, { weight, display: "block" });
      document.fonts.add(await face.load());
    })
  )
    .catch((err: unknown) => {
      // A missing face degrades to system-ui; it shouldn't fail the render.
      console.warn("Crate Recap: font failed to load", err);
    })
    .finally(() => continueRender(handle));
}
