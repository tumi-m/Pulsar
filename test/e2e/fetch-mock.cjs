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
    // Real-looking CDN path (host matches next.config remotePatterns); served
    // as a PNG by the image branch below so /api/artwork can stream it offline.
    artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music1001/lp.jpg/1200x1200bb.jpg",
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

    // iTunes album search → one album that ECHOES the query term back as both
    // artist and title. /api/artwork (and friends) match strictly on BOTH
    // artist and title before trusting a result, so a single canned album
    // 404s every other cover and the grid loses its <img> elements. Echoing
    // the term satisfies the strict matchers for any release, and the CDN
    // artwork URL below is served as a 1×1 PNG by the image branch.
    if (url && url.startsWith("https://itunes.apple.com/search")) {
      let term = "";
      try {
        term = decodeURIComponent(new URL(url).searchParams.get("term") ?? "");
      } catch {
        term = "";
      }
      const echoed = term || `${ITUNES_ALBUM.artistName} ${PEPPER}`;
      return json({
        resultCount: 1,
        results: [
          {
            ...ITUNES_ALBUM,
            artistName: echoed,
            collectionName: echoed,
          },
        ],
      });
    }
    // iTunes lookup → the tracklist for our canned album id.
    if (url && url.startsWith("https://itunes.apple.com/lookup")) {
      return json({ resultCount: ITUNES_TRACKS.length, results: ITUNES_TRACKS });
    }

    // Image CDNs (Wikipedia covers, Apple/Spotify/Deezer art, Cover Art
    // Archive…). next/image's optimizer fetches these server-side; returning
    // empty JSON here makes every cover 500 → the Artwork component cascades
    // to its letter-tile fallback, which renders NO <img> — e2e assertions on
    // "main img" then see zero tiles. Serve a valid 1×1 PNG instead so the
    // optimizer succeeds and the grid keeps real <img> elements, fully offline.
    const PNG_1X1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const IMAGE_HOST =
      /(^|\.)((upload\.)?wikimedia\.org|mzstatic\.com|scdn\.co|cloudfront\.net|supabase\.co|bcbits\.com|ytimg\.com|dzcdn\.net|coverartarchive\.org|archive\.org)$/i;
    let host = null;
    try {
      host = new URL(url).hostname;
    } catch {
      host = null;
    }
    if (host && IMAGE_HOST.test(host)) {
      return new Response(PNG_1X1, {
        status: 200,
        headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
      });
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