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

// Use a separate test database
const TEST_DATABASE_URL = "file:./test.db";

process.env.DATABASE_URL = TEST_DATABASE_URL;

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

// Clean all tables before each test using raw SQL in a transaction for speed.
// A single transaction with raw DELETEs is much faster than 12 sequential
// Prisma deleteMany calls, especially in constrained environments (Docker, CI).
beforeEach(async () => {
  await testPrisma.$transaction([
    testPrisma.$executeRawUnsafe('DELETE FROM "GoogleDocExport"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "GoogleCredential"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "Relationship"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "Annotation"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "ContentVersion"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "StoryObject"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "StructureNode"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "WorldObjectTimelineEntry"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "WorldObject"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "Project"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "Universe"'),
    testPrisma.$executeRawUnsafe('DELETE FROM "User"'),
  ]);
});
