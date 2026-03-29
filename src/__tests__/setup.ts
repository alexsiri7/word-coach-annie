import { PrismaClient } from "@prisma/client";
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

// Use a separate test database — set TEST_DATABASE_URL to override.
// Defaults to a local SQLite file for fast CI; use a Postgres URL for integration tests.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "file:./test.db";

process.env.DATABASE_URL = TEST_DATABASE_URL;

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

// Clean all tables before each test. TRUNCATE CASCADE handles FK ordering
// automatically on PostgreSQL — no need to worry about delete order.
beforeEach(async () => {
  await testPrisma.$executeRawUnsafe(
    `TRUNCATE TABLE
      "GoogleDocExport", "GoogleCredential", "ChatMessage", "UserAiSettings",
      "AiSettings", "WritingSession", "Relationship", "Annotation",
      "ContentVersion", "StoryObject", "StructureNode", "ProjectShare",
      "WorldObjectTimelineEntry", "WorldObject", "Project", "Universe", "User"
    CASCADE`
  );
});
