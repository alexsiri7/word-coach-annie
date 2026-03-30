import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  // During next build (page data collection), DATABASE_URL may not be set.
  // Use a placeholder URL so PrismaClient can be constructed; it will fail on
  // first actual query, which is fine since builds don't query the database.
  const adapter = new PrismaPg({
    connectionString: connectionString || "postgresql://build:build@localhost:5432/build",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
