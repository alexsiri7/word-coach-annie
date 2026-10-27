import type { DbClient } from "@/lib/db";

/** Check if `possibleDescendantId` is `ancestorId` or one of its descendants. */
async function isDescendant(
  db: DbClient,
  ancestorId: string,
  possibleDescendantId: string
): Promise<boolean> {
  let currentId: string | null = possibleDescendantId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === ancestorId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const found: { parentId: string | null } | null = await db.structureNode.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = found?.parentId ?? null;
  }

  return false;
}

export class InvalidParentError extends Error {}

/**
 * Throws InvalidParentError unless `parentId` is a node in the same project
 * that is neither `node` nor one of its descendants.
 *
 * Row-locks the project until `tx` commits, serializing re-parents within it:
 * the descendant walk reads other nodes' parentIds, so two concurrent
 * re-parents (A under B, B under A) would each pass against the other's stale
 * parent and together form a cycle. Write the new parentId inside the same
 * transaction.
 */
export async function assertValidParent(
  tx: DbClient,
  node: { id: string; projectId: string },
  parentId: string
): Promise<void> {
  if (parentId === node.id) throw new InvalidParentError("A node cannot be its own parent");

  await tx.project.update({
    where: { id: node.projectId },
    data: { updatedAt: new Date() },
  });

  const parent = await tx.structureNode.findFirst({
    where: { id: parentId, projectId: node.projectId },
    select: { id: true },
  });
  if (!parent) throw new InvalidParentError("Parent node not found in this project");

  if (await isDescendant(tx, node.id, parentId)) {
    throw new InvalidParentError("Cannot move a node into its own descendant");
  }
}
