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

// Use a separate test database — set TEST_DATABASE_URL to override.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set for tests");
}

process.env.DATABASE_URL = TEST_DATABASE_URL;

const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
export const testPrisma = new PrismaClient({ adapter });

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
