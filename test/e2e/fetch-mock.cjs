/**
 * Server-side fetch mock for Playwright E2E.
 *
 * Loaded via NODE_OPTIONS=--require ./test/e2e/fetch-mock.cjs before the Next
 * dev server boots. It patches globalThis.fetch so the server-side data paths
 * (RSC page's getLiveFeed, the /api/album route's iTunes/Deezer calls) never
 * touch the real network. Localhost (the app's own dev server / /_next assets)
 * is passed through to the real fetch.
 *
 * Result: a fully deterministic grid driven by the built-in CATALOG, and a
 * deterministic tracklist driven by canned iTunes responses — no external
 * API keys or network required, so E2E runs green in CI.
 */
(function () {
  if (typeof globalThis.fetch !== "function") return;
  const real = globalThis.fetch;

  // Canned iTunes album used by the "open album → tracklist" flow.
  // collectionName matches a CATALOG entry so pickBestMatch (lib/match) selects it.
  const PEPPER = "Sgt. Pepper's Lonely Hearts Club Band";
  const ITUNES_ALBUM = {
    collectionId: 1001,
    artistName: "The Beatles",
    collectionName: PEPPER,
    releaseDate: "1967-06-01T00:00:00Z",
  };
  const ITUNES_TRACKS = [
    { wrapperType: "track", kind: "song", trackNumber: 1, trackName: "Sgt. Pepper's Lonely Hearts Club Band", trackTimeMillis: 122000, previewUrl: null },
    { wrapperType: "track", kind: "song", trackNumber: 2, trackName: "With a Little Help from My Friends", trackTimeMillis: 163000, previewUrl: null },
    { wrapperType: "track", kind: "song", trackNumber: 3, trackName: "Lucy in the Sky with Diamonds", trackTimeMillis: 208000, previewUrl: null },
  ];

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  globalThis.fetch = async function patched(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input && input.url;

    // Pass through same-origin / localhost (the app's own dev server + /_next).
    if (!url || /^http:\/\/localhost/.test(url) || /^http:\/\/127\.0\.0\.1/.test(url)) {
      return real(input, init);
    }

    // iTunes album search → one matching album.
    if (url && url.startsWith("https://itunes.apple.com/search")) {
      return json({ resultCount: 1, results: [ITUNES_ALBUM] });
    }
    // iTunes lookup → the tracklist for our canned album id.
    if (url && url.startsWith("https://itunes.apple.com/lookup")) {
      return json({ resultCount: ITUNES_TRACKS.length, results: ITUNES_TRACKS });
    }

    // Every other external DSP / feed endpoint (Deezer, Apple RSS, MusicBrainz,
    // lyrics.ovh, YouTube) → empty but well-formed JSON so the feed merge
    // resolves to [] and the CATALOG alone drives the grid.
    if (url && /^https?:\/\//.test(url)) {
      return json({ results: [], data: [] });
    }

    return real(input, init);
  };
})();