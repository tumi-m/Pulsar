import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. A Node preload (test/e2e/fetch-mock.cjs) patches globalThis.fetch
 * before the dev server boots, intercepting every external DSP host with
 * canned data and passing localhost through — so the suite runs fully offline
 * against the dev server, driven by the built-in CATALOG.
 */
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Devcontainers/CI images often mount a tiny 64MB /dev/shm, which makes
    // Chromium tabs crash ("Target crashed"). Force off-heap temp storage.
    // Also disable the GPU process + force SwiftShader software WebGL: the
    // release-detail sheet mounts a three.js canvas, and hardware GL paths
    // crash the renderer ("Page crashed") in GPU-less containers.
    launchOptions: {
      args: [
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Boot the dev server with a CLEAN data cache: the CI job runs an
    // unmocked `npm run build` first, and that build persists real
    // Deezer/Apple feed responses into .next/cache/fetch with long
    // revalidate windows (up to 30 days for some routes). The mocked dev
    // server would serve those cached REAL responses without ever calling
    // fetch, so a lucky CI runner (network-wise) could ship a ~2000-release
    // feed payload that truncates the CATALOG payload and breaks the
    // "Beatles" search assertion. Wiping .next/cache/fetch makes the e2e
    // run deterministic: only fetch-mock data is ever served.
    command: "node -e \"require('fs').rmSync('.next/cache',{recursive:true,force:true})\" && npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Inject the server-side fetch mock before the dev server boots so the
    // RSC page + /api routes never touch the real network.
    env: {
      ...process.env,
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--require ${require("path").resolve(__dirname, "test/e2e/fetch-mock.cjs")}`,
      ]
        .filter(Boolean)
        .join(" "),
    },
  },
});