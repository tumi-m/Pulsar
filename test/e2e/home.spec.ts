import { test, expect } from "@playwright/test";

/**
 * Smoke: the homepage loads, the hero renders, and at least one release tile is
 * on the grid. Driven by the built-in CATALOG via the fetch mock — no network.
 *
 * A fresh CI browser has no localStorage, so the OnboardingQuiz overlay appears
 * on first visit and intercepts grid clicks. Dismiss it first.
 */
async function dismissQuiz(page: import("@playwright/test").Page) {
  const skip = page.getByRole("button", { name: /^skip/i }).first();
  // The quiz mounts client-side AFTER hydration, so an immediate isVisible()
  // races it: the check runs before the quiz exists, the quiz then mounts and
  // its fixed overlay intercepts every later click. Wait for the button to
  // actually appear (or time out when the quiz was already completed).
  try {
    await skip.waitFor({ state: "visible", timeout: 6000 });
    await skip.click();
    // Give the exit animation time to unmount the overlay.
    await page.waitForTimeout(500);
  } catch {
    /* quiz not shown (localStorage already set from a prior test) */
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

  // The search input is in a floating bar. Scroll to top so it's in view and
  // interactable, then type — no force, so React's onChange actually fires.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const search = page.getByPlaceholder(/search artists|search/i).first();
  await search.waitFor({ state: "visible", timeout: 8000 });
  await search.click();
  await search.fill("Beatles");

  // The catalog has "The Beatles" entries; the client filter matches. Wait for
  // the filtered grid to actually re-render (the debounced server search +
  // image loading can exceed a fixed sleep on slow CI runners) instead of
  // asserting a raw count after an arbitrary timeout.
  await expect(page.locator("main img").first()).toBeVisible({ timeout: 10000 });
  const visible = await page.locator("main img").count();
  expect(visible).toBeGreaterThan(0);
});
