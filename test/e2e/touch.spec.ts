import { test, expect, devices } from "@playwright/test";

/**
 * Touch, specifically — mouse clicks never exercised these bugs, which is how
 * they shipped.
 *
 * 1. Tapping a release tile did nothing. A tap focuses the cover, focus
 *    revealed the play triangle under the finger between press and release,
 *    and the browser delivered the click to the wrapper (the two elements'
 *    common ancestor) instead of the cover button.
 * 2. The hidden quick-action bar still took taps: tapping near the top of a
 *    tile silently favourited it.
 */
// iPhone geometry and touch, but Chromium: the device preset defaults to
// WebKit, which the project's CI image doesn't install.
const { defaultBrowserType: _webkit, ...iphone } = devices["iPhone 13"];
void _webkit;
test.use({ ...iphone, browserName: "chromium" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pulsar_quiz_skipped", "1");
    localStorage.setItem("pulsar_onboarded", "1");
  });
});

test("tapping a release tile opens its album", async ({ page }) => {
  await page.goto("/");
  const cover = page.locator("button[aria-label*='Open album']").first();
  await cover.waitFor({ timeout: 15000 });
  const box = (await cover.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("[role=dialog][aria-label*=' by ']")).toHaveCount(1, { timeout: 5000 });
});

test("tapping the top of a tile doesn't hit its hidden buttons", async ({ page }) => {
  await page.goto("/");
  const cover = page.locator("button[aria-label*='Open album']").first();
  await cover.waitFor({ timeout: 15000 });
  const box = (await cover.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 18);
  await page.waitForTimeout(800);
  const favs = await page.evaluate(() => JSON.parse(localStorage.getItem("pulsar_favorites_v1") || "[]").length);
  expect(favs).toBe(0);
});
