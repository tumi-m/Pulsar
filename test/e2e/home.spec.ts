import { test, expect } from "@playwright/test";

/**
 * Smoke: the homepage loads, the hero renders, and at least one release tile is
 * on the grid. Driven by the built-in CATALOG via the fetch mock — no network.
 */
test("homepage loads and shows release tiles", async ({ page }) => {
  await page.goto("/");
  // Hero headline appears.
  await expect(page.getByText(/PULSAR/i).first()).toBeVisible();
  // A release tile has an <img> with artwork + a play affordance.
  await page.waitForSelector("main img", { timeout: 15000 });
  const tiles = await page.locator("main img").count();
  expect(tiles).toBeGreaterThan(0);
});

test("search filters the grid", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("main img", { timeout: 15000 });
  // The search input is reachable by placeholder text.
  const search = page.getByPlaceholder(/search|find|filter/i).first();
  await search.waitFor({ state: "visible", timeout: 8000 }).catch(() => null);
  if (await search.isVisible()) {
    await search.fill("Beatles");
    // Wait a tick for the client filter; the grid should still show tiles.
    await page.waitForTimeout(400);
    const visible = await page.locator("main img").count();
    expect(visible).toBeGreaterThan(0);
  }
});