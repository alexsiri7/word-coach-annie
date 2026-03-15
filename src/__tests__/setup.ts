import { PrismaClient } from "@prisma/client";
import { beforeEach } from "vitest";

// Use a separate test database
const TEST_DATABASE_URL = "file:./test.db";

process.env.DATABASE_URL = TEST_DATABASE_URL;

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

// Clean all tables before each test
beforeEach(async () => {
  await testPrisma.googleDocExport.deleteMany();
  await testPrisma.googleCredential.deleteMany();
  await testPrisma.relationship.deleteMany();
  await testPrisma.annotation.deleteMany();
  await testPrisma.contentVersion.deleteMany();
  await testPrisma.storyObject.deleteMany();
  await testPrisma.structureNode.deleteMany();
  await testPrisma.worldObjectTimelineEntry.deleteMany();
  await testPrisma.worldObject.deleteMany();
  await testPrisma.project.deleteMany();
  await testPrisma.universe.deleteMany();
  await testPrisma.user.deleteMany();
});
