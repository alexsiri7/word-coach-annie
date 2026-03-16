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
      exclude: [
        "src/components/**",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/hooks/**",
      ],
      // Coverage threshold — keep above 35% floor, raise as tests improve
      thresholds: {
        statements: 35,
        branches: 35,
        functions: 35,
        lines: 35,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
