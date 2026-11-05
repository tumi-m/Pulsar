/**
 * Anime.js, fetched the first time something actually animates with it.
 *
 * The sample graph is reachable from the home page (ReleaseGrid →
 * SamplesExplorer → SamplePage → SampleGraph), so a static `import "animejs"`
 * there would put the engine in "/"'s First Load JS for an effect most visits
 * never see. Callers await `loadAnime()` at the moment of need instead.
 *
 * No `window` or `document` here at module scope: this file is imported by
 * client components that are still server-rendered.
 */

type Anime = typeof import("animejs");

/** The slice of Anime.js the app uses. Widen it here when a caller needs more. */
export type AnimeKit = Pick<Anime, "createTimeline" | "createDrawable" | "cubicBezier">;

/**
 * Memoise an async import. Concurrent callers share one in-flight request, and
 * every later caller gets the same settled promise — so the chunk is fetched
 * once per page however many graphs mount.
 *
 * A failure is NOT cached: a chunk that 404'd mid-deploy or dropped on a
 * flaky connection would otherwise disable the animation for the rest of the
 * visit, when the very next attempt would probably have worked.
 */
export function cachedImport<T>(importer: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = importer().catch((err: unknown) => {
        pending = null;
        throw err;
      });
    }
    return pending;
  };
}

/**
 * `p`'s value if it settles within `ms`, otherwise null. For decoration that
 * must never hold content back: a caller that has its data in hand waits at
 * most `ms` for the library, then shows the data without the effect. Webpack
 * gives a stalled chunk two minutes before it fails, so awaiting the import
 * itself could keep a loaded graph behind a spinner that long.
 *
 * `p` is not cancelled, so a late chunk still lands in `cachedImport`'s cache
 * and the next caller gets it at once. A rejection resolves to null too. That
 * only covers `p` from the moment this is called, though: a promise started
 * earlier (alongside a fetch, say) needs its own catch for the time between.
 */
export function ifReadyWithin<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

/**
 * Destructured rather than handed back whole: webpack can only tree-shake a
 * dynamic import whose used exports it can see, and the full namespace would
 * drag draggable, layout, text and WAAPI into the chunk — about three times
 * the code the graph runs.
 */
export const loadAnime: () => Promise<AnimeKit> = cachedImport(async () => {
  const { createTimeline, createDrawable, cubicBezier } = await import("animejs");
  return { createTimeline, createDrawable, cubicBezier };
});
