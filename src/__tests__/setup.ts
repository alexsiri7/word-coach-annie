import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeEach, vi } from "vitest";

// Global mock for Sentry — prevents real Sentry calls in all tests
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  replayIntegration: vi.fn(),
  browserTracingIntegration: vi.fn(),
  captureRequestError: vi.fn(),
}));

// SAFETY: Only use TEST_DATABASE_URL — never fall back to DATABASE_URL.
// Falling back to DATABASE_URL destroyed production data when agents ran tests
// in worktrees that had .env.local with the production connection string.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must be set for tests. " +
    "This intentionally does NOT fall back to DATABASE_URL to prevent destroying production data."
  );
}

if (TEST_DATABASE_URL.includes("supabase.com") || TEST_DATABASE_URL.includes("pooler.supabase.com")) {
  throw new Error("TEST_DATABASE_URL points to Supabase — refusing to run tests against production.");
}

process.env.DATABASE_URL = TEST_DATABASE_URL;

const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
export const testPrisma = new PrismaClient({ adapter });

// Clean all tables before each test. TRUNCATE CASCADE handles FK ordering
// automatically on PostgreSQL — no need to worry about delete order.
beforeEach(async () => {
  await testPrisma.$executeRawUnsafe(
    `TRUNCATE TABLE
      "OAuthClient", "GoogleDocExport", "GoogleCredential", "ChatMessage",
      "UserAiSettings", "AiSettings", "WritingSession", "Relationship",
      "Annotation", "ContentVersion", "StoryObject", "StructureNode",
      "ProjectShare", "WorldObjectTimelineEntry", "WorldObject", "Project",
      "Universe", "User"
    CASCADE`
  );
});
