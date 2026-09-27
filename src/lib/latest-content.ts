import { Prisma } from "@prisma/client";
import { prisma, databaseSchema } from "@/lib/db";

/**
 * Latest ContentVersion.content for each node, fetched one row per node.
 *
 * Prisma's `distinct` and nested `take: 1` are applied in memory (Prisma 7
 * without the nativeDistinct/relationJoins previews), so they load every
 * stored version — see #1156. DISTINCT ON over the (nodeId, createdAt DESC)
 * index makes Postgres return only the newest row.
 */
export async function getLatestContent(nodeIds: string[]): Promise<Map<string, string>> {
  if (nodeIds.length === 0) return new Map();
  // The adapter only qualifies Prisma-generated SQL (see src/lib/db.ts), not raw queries.
  const schema = databaseSchema();
  const table = Prisma.raw(schema ? `"${schema}"."ContentVersion"` : `"ContentVersion"`);
  const rows = await prisma.$queryRaw<{ nodeId: string; content: string }[]>`
    SELECT DISTINCT ON ("nodeId") "nodeId", "content"
    FROM ${table}
    WHERE "nodeId" IN (${Prisma.join(nodeIds)})
    ORDER BY "nodeId", "createdAt" DESC`;
  return new Map(rows.map((r) => [r.nodeId, r.content]));
}
