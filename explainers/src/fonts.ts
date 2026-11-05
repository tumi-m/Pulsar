import interSemiBold from '@fontsource/inter/files/inter-latin-600-normal.woff2';
import interExtraBold from '@fontsource/inter/files/inter-latin-800-normal.woff2';
import spaceMonoBold from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff2';

/**
 * Pulsar's two typefaces, registered with the document for the canvas.
 *
 * The app loads Inter and Space Mono through next/font, which renames each
 * family to a hashed one (`__Inter_…`), so a canvas asking for "Inter" would
 * silently fall back to the system sans. The explainer brings its own copies:
 * three latin-subset files (~65 kB together), only the weights it draws with.
 *
 * Text is measured for layout when a node is created, so the scene must wait
 * for these before it builds anything — `yield fontsReady` does that (the
 * player awaits promises a scene yields). A failed load resolves anyway: the
 * fallback stacks below are legible, and a blank explainer is not.
 */
export const SANS = 'Inter, system-ui, sans-serif';
export const MONO = '"Space Mono", ui-monospace, monospace';

const FACES: [family: string, url: string, weight: string][] = [
  ['Inter', interSemiBold, '600'],
  ['Inter', interExtraBold, '800'],
  ['Space Mono', spaceMonoBold, '700'],
];

function load(): Promise<unknown> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  return Promise.all(
    FACES.map(([family, url, weight]) => {
      const face = new FontFace(family, `url(${url})`, {weight, display: 'block'});
      document.fonts.add(face);
      return face.load().catch(() => undefined);
    }),
  );
}

let pending: Promise<unknown> | null = null;
/** Loads once per page, however many players or editor reloads ask. */
export const fontsReady = (): Promise<unknown> => (pending ??= load());
