import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    environment: "node",
    globals: true,
    clearMocks: true,
    testTimeout: 15000,
    hookTimeout: 15000,
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
      // Coverage threshold — keep above 50% floor, raise as tests improve
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
