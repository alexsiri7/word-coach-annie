import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./src/__tests__/globalSetup.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    // Run test files sequentially to avoid shared DB conflicts
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      // Start at 1%, raise incrementally (current: ~6.6%)
      thresholds: {
        statements: 1,
        branches: 1,
        functions: 1,
        lines: 1,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
