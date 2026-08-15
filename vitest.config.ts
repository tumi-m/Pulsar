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
      // Exclude pure data dumps and the harness — they're not logic to cover.
      exclude: [
        "lib/types.ts",
        "lib/catalog*.ts",
        "lib/grammy-artists.ts",
        "lib/perf-harness.ts",
      ],
      reporter: ["text", "text-summary", "html"],
      thresholds: { statements: 60, lines: 60, branches: 40, functions: 40 },
    },
  },
});