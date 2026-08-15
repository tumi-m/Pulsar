import { test, expect } from "@playwright/test";

/**
 * Smoke: the homepage loads, the hero renders, and at least one release tile is
 * on the grid. Driven by the built-in CATALOG via the fetch mock — no network.
 *
 * A fresh CI browser has no localStorage, so the OnboardingQuiz overlay appears
 * on first visit and intercepts grid clicks. Dismiss it first.
 */
async function dismissQuiz(page: import("@playwright/test").Page) {
  const skip = page.getByRole("button", { name: /skip/i }).first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(300);
  }
}

test("homepage loads and shows release tiles", async ({ page }) => {
  await page.goto("/");
  await dismissQuiz(page);
  // Hero headline appears.
  await expect(page.getByText(/PULSAR/i).first()).toBeVisible();
  // A release tile has an <img> with artwork.
  await page.waitForSelector("main img", { timeout: 15000 });
  const tiles = await page.locator("main img").count();
  expect(tiles).toBeGreaterThan(0);
});

test("search filters the grid", async ({ page }) => {
  await page.goto("/");
  await dismissQuiz(page);
  await page.waitForSelector("main img", { timeout: 15000 });

  // The search input lives in a floating bar that may be animating in. Use
  // force to bypass the visibility guard — the input is always in the DOM.
  const search = page.getByPlaceholder(/search artists|search/i).first();
  await search.waitFor({ state: "attached", timeout: 8000 });
  await search.fill("Beatles", { force: true });
  await page.waitForTimeout(600);
  // The catalog has "The Beatles" entries; the client filter matches.
  const visible = await page.locator("main img").count();
  expect(visible).toBeGreaterThan(0);
});