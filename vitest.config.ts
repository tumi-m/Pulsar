import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["test/e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**"],
      // Exclude pure data dumps, the perf harness, and browser-only hooks/UI
      // modules that aren't unit-testable logic (they need a real DOM / Supabase
      // session). Logic modules stay in coverage.
      exclude: [
        "lib/types.ts",
        "lib/catalog*.ts",
        "lib/grammy-artists.ts",
        "lib/perf-harness.ts",
        "lib/palette.ts",
        "lib/theme.ts",
        "lib/useBackClose.ts",
        "lib/useCollectionState.ts",
        "lib/useIsTouch.ts",
        "lib/useScrollLock.ts",
        "lib/audio-engine.ts",
        "lib/capabilities.ts",
        "lib/sync.ts",
        // DSP API clients — OAuth flows and live fetch calls to Spotify /
        // Apple / YouTube. Only their shared pure helpers (lib/dsp/shared.ts)
        // are unit-testable; see test/dsp/shared.test.ts.
        "lib/dsp/apple.ts",
        "lib/dsp/spotify.ts",
        "lib/dsp/youtube.ts",
      ],
      reporter: ["text", "text-summary", "html"],
      thresholds: { statements: 60, lines: 60, branches: 40, functions: 40 },
    },
  },
});