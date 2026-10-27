import { prisma } from "@/lib/db";

/** Check if `possibleDescendantId` is `ancestorId` or one of its descendants. */
export async function isDescendant(ancestorId: string, possibleDescendantId: string): Promise<boolean> {
  let currentId: string | null = possibleDescendantId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === ancestorId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const found: { parentId: string | null } | null = await prisma.structureNode.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = found?.parentId ?? null;
  }

  return false;
}
