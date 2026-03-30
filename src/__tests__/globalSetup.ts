import { execSync } from "child_process";

/**
 * Vitest global setup: ensure the test database schema exists.
 * SAFETY: Only uses TEST_DATABASE_URL — never falls back to DATABASE_URL
 * to prevent accidentally running db push against production.
 */
export function setup() {
  const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
  if (!TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL must be set for tests. " +
      "This intentionally does NOT fall back to DATABASE_URL to prevent destroying production data. " +
      "Set TEST_DATABASE_URL to a local/test PostgreSQL instance."
    );
  }

  // Refuse to run against anything that looks like a production database
  if (TEST_DATABASE_URL.includes("supabase.com") || TEST_DATABASE_URL.includes("pooler.supabase.com")) {
    throw new Error(
      "TEST_DATABASE_URL points to Supabase — refusing to run tests against a production-like database. " +
      "Use a local PostgreSQL instance for tests."
    );
  }

  execSync("npx prisma db push --accept-data-loss --url " + JSON.stringify(TEST_DATABASE_URL), {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
