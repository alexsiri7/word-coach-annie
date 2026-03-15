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
      // Coverage threshold raised to 30% (an-aoo)
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
