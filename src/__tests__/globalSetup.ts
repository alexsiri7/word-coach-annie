import { execSync } from "child_process";

/**
 * Vitest global setup: ensure the test database schema exists.
 * Safe for test DBs only — production uses hand-written migrations.
 */
export function setup() {
  const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "file:./test.db";
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
