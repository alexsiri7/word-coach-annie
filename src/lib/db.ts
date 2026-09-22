import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withConnectionRetry } from "@/lib/db-retry";

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

// Supavisor (the Supabase pooler) intermittently fails to reach the upstream
// database — see #1143. That failure happens before any statement is sent, so
// retrying is safe even for writes. src/lib/db-retry.ts defines which errors
// qualify; do not widen it without reading the comment there.
export const connectionRetry = Prisma.defineExtension({
  name: "connectionRetry",
  query: {
    async $allOperations({ model, operation, args, query }) {
      return withConnectionRetry(() => query(args), { model, operation });
    },
  },
});

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  // During next build (page data collection), DATABASE_URL may not be set.
  // Use a placeholder URL so PrismaClient can be constructed; it will fail on
  // first actual query, which is fine since builds don't query the database.
  const adapter = new PrismaPg({
    connectionString: connectionString || "postgresql://build:build@localhost:5432/build",
  });
  return new PrismaClient({ adapter }).$extends(connectionRetry);
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * The app's Prisma client, or an interactive-transaction handle derived from
 * it. The deny list is read off Prisma's own `TransactionClient` so it stays
 * correct as Prisma changes which members a transaction handle drops.
 */
export type DbClient = Omit<
  ExtendedPrismaClient,
  Exclude<keyof PrismaClient, keyof Prisma.TransactionClient>
>;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
