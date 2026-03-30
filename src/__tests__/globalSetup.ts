import { execSync } from "child_process";

/**
 * Vitest global setup: ensure the test database schema exists.
 * Safe for test DBs only — production uses hand-written migrations.
 */
export function setup() {
  const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set for tests");
  }
  execSync("npx prisma db push --accept-data-loss --url " + JSON.stringify(TEST_DATABASE_URL), {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
