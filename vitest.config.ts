import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    exclude: ["e2e/**", "node_modules/**"],
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
      // Coverage threshold — keep above 25% floor, raise as tests improve
      thresholds: {
        statements: 25,
        branches: 25,
        functions: 25,
        lines: 25,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
