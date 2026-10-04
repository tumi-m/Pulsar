import { test, expect, type Route } from "@playwright/test";

/**
 * The whole "export this crate to Spotify" path, in a real browser: the dock,
 * the export sheet, the build overlay and the result card, against a faked
 * Spotify Web API that only answers the endpoints Spotify serves today
 * (POST /me/playlists, POST /playlists/{id}/items). The retired /tracks and
 * /users/{id}/playlists calls answer 404 here, as they do on Spotify.
 */

const crate = [
  { id: "r1", title: "GNX", artist: "Kendrick Lamar", artwork_url: "", release_date: "2024-11-22", type: "album" },
  { id: "r2", title: "Brat", artist: "Charli XCX", artwork_url: "", release_date: "2024-06-07", type: "album" },
  { id: "r3", title: "Nowhere Record", artist: "Nobody At All", artwork_url: "", release_date: "2024-01-01", type: "album" },
];

const albums: Record<string, { id: string; name: string; artist: string }> = {
  "kendrick lamar": { id: "alb_gnx", name: "GNX", artist: "Kendrick Lamar" },
  "charli xcx": { id: "alb_brat", name: "Brat", artist: "Charli XCX" },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((releases) => {
    localStorage.setItem("pulsar_quiz_skipped", "1");
    localStorage.setItem("pulsar_onboarded", "1");
    localStorage.setItem("pulsar_crates_v2", JSON.stringify([{ id: "default", name: "Road Trip", releases }]));
    localStorage.setItem(
      "pulsar_dsp_token_spotify",
      JSON.stringify({ access_token: "fake-token", expires_at: Date.now() + 3600_000 })
    );
    // The scopes the token was granted with; a mismatch forces re-consent.
    localStorage.setItem("pulsar_spotify_scopes", "playlist-modify-public playlist-modify-private user-read-private");
  }, crate);
  await page.route("**/api/dsp-config", (route) =>
    route.fulfill({
      json: {
        spotifyClientId: "fake-client",
        googleClientId: "",
        tidalClientId: "",
        appleEnabled: false,
        missing: { spotify: [], youtube_music: ["GOOGLE_CLIENT_ID"], tidal: ["TIDAL_CLIENT_ID"], apple_music: ["APPLE_TEAM_ID"] },
      },
    })
  );
});

test("a crate exports to Spotify on today's endpoints", async ({ page }) => {
  const calls: string[] = [];
  let added: string[] = [];
  await page.route("https://api.spotify.com/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/v1", "");
    calls.push(`${req.method()} ${path}`);
    // Slow enough that the build overlay is actually on screen.
    await new Promise((r) => setTimeout(r, 120));
    if (path === "/search") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const hit = Object.entries(albums).find(([artist]) => q.includes(artist))?.[1];
      const type = url.searchParams.get("type");
      if (type === "album")
        return route.fulfill({
          json: { albums: { items: hit ? [{ id: hit.id, name: hit.name, artists: [{ name: hit.artist }] }] : [] } },
        });
      return route.fulfill({ json: { tracks: { items: [] } } });
    }
    const albumTracks = path.match(/^\/albums\/(alb_\w+)\/tracks$/);
    if (albumTracks)
      return route.fulfill({
        json: { items: [1, 2, 3].map((n) => ({ uri: `spotify:track:${albumTracks[1]}_${n}` })), next: null },
      });
    if (req.method() === "POST" && path === "/me/playlists")
      return route.fulfill({
        status: 201,
        json: { id: "pl_1", external_urls: { spotify: "https://open.spotify.com/playlist/pl_1" } },
      });
    if (req.method() === "POST" && path === "/playlists/pl_1/items") {
      added = added.concat(JSON.parse(req.postData() ?? "{}").uris ?? []);
      return route.fulfill({ status: 201, json: { snapshot_id: "s1" } });
    }
    return route.fulfill({ status: 404, json: { error: { status: 404, message: "Not found" } } });
  });

  await page.goto("/");
  await page.locator("button[aria-label^='Your crate']").click();
  await page.locator("button[aria-label^='Export 3']").click();
  const sheet = page.locator("[role=dialog][aria-label='Export this crate']");
  await expect(sheet.getByText("Creates the playlist on your account")).toBeVisible();
  await sheet.getByRole("button", { name: /Spotify/ }).click();

  await expect(page.locator("[role=dialog][aria-label='Building your Spotify playlist']")).toBeVisible();
  await expect(page.getByText("Playlist created")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("“Road Trip” is now on your Spotify")).toBeVisible();
  await expect(page.getByText("from 2 of 3 records")).toBeVisible();
  await expect(page.getByText("1 not found on Spotify")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Spotify" })).toHaveAttribute(
    "href",
    "https://open.spotify.com/playlist/pl_1"
  );

  expect(added).toHaveLength(6);
  expect(calls).toContain("POST /me/playlists");
  expect(calls).toContain("POST /playlists/pl_1/items");
  expect(calls.some((c) => c.endsWith("/tracks") && c.startsWith("POST"))).toBe(false);
});

test("nothing is created when none of the crate is on Spotify", async ({ page }) => {
  const posts: string[] = [];
  await page.route("https://api.spotify.com/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") posts.push(req.url());
    const type = new URL(req.url()).searchParams.get("type");
    return route.fulfill({ json: type === "album" ? { albums: { items: [] } } : { tracks: { items: [] } } });
  });

  await page.goto("/");
  await page.locator("button[aria-label^='Your crate']").click();
  await page.locator("button[aria-label^='Export 3']").click();
  await page.locator("[role=dialog][aria-label='Export this crate']").getByRole("button", { name: /Spotify/ }).click();

  await expect(page.getByText("Spotify export failed")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/None of the 3/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV instead" })).toBeVisible();
  expect(posts).toHaveLength(0);
});

test("a 403 on search explains the allow-list and offers a reconnect", async ({ page }) => {
  await page.route("https://api.spotify.com/**", (route) =>
    route.fulfill({ status: 403, json: { error: { status: 403, message: "Forbidden" } } })
  );

  await page.goto("/");
  await page.locator("button[aria-label^='Your crate']").click();
  await page.locator("button[aria-label^='Export 3']").click();
  await page.locator("[role=dialog][aria-label='Export this crate']").getByRole("button", { name: /Spotify/ }).click();

  await expect(page.getByText("Spotify export failed")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/approved/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect to Spotify" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Spotify dashboard/ })).toHaveAttribute("href", /developer\.spotify\.com/);
});
