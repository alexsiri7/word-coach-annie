import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectWriteAccessByNode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

/**
 * POST /api/nodes/move
 * Moves a node to a new parent at a specific position, reindexing siblings.
 * Body: { nodeId: string, newParentId: string | null, newIndex: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, newParentId, newIndex } = body;

    if (!nodeId || newIndex === undefined || newIndex === null) {
      return NextResponse.json(
        { error: "nodeId and newIndex are required" },
        { status: 400 }
      );
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccessByNode(nodeId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const node = await prisma.structureNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    // Validate parent exists (if specified) and belongs to the same project
    if (newParentId !== undefined && newParentId !== null) {
      if (newParentId === nodeId) {
        return NextResponse.json(
          { error: "A node cannot be its own parent" },
          { status: 400 }
        );
      }
      const parent = await prisma.structureNode.findFirst({
        where: { id: newParentId, projectId: node.projectId },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "Parent node not found in this project" },
          { status: 400 }
        );
      }
      // Prevent nesting a node inside its own descendant
      if (await isDescendant(nodeId, newParentId)) {
        return NextResponse.json(
          { error: "Cannot move a node into its own descendant" },
          { status: 400 }
        );
      }
    }

    const oldParentId = node.parentId;
    const resolvedNewParentId = newParentId === undefined ? oldParentId : newParentId;
    const sameParent = oldParentId === resolvedNewParentId;

    // Use a transaction to keep indices consistent
    await prisma.$transaction(async (tx) => {
      if (sameParent) {
        // Reorder within the same parent
        const siblings = await tx.structureNode.findMany({
          where: {
            projectId: node.projectId,
            parentId: oldParentId,
          },
          orderBy: { orderIndex: "asc" },
          select: { id: true },
        });

        const ids = siblings.map((s) => s.id).filter((id) => id !== nodeId);
        ids.splice(newIndex, 0, nodeId);

        for (let i = 0; i < ids.length; i++) {
          await tx.structureNode.update({
            where: { id: ids[i] },
            data: { orderIndex: i },
          });
        }
      } else {
        // Move to a different parent
        // 1. Remove from old parent and reindex
        const oldSiblings = await tx.structureNode.findMany({
          where: {
            projectId: node.projectId,
            parentId: oldParentId,
          },
          orderBy: { orderIndex: "asc" },
          select: { id: true },
        });

        const oldIds = oldSiblings.map((s) => s.id).filter((id) => id !== nodeId);
        for (let i = 0; i < oldIds.length; i++) {
          await tx.structureNode.update({
            where: { id: oldIds[i] },
            data: { orderIndex: i },
          });
        }

        // 2. Insert into new parent at newIndex
        const newSiblings = await tx.structureNode.findMany({
          where: {
            projectId: node.projectId,
            parentId: resolvedNewParentId,
          },
          orderBy: { orderIndex: "asc" },
          select: { id: true },
        });

        const newIds = newSiblings.map((s) => s.id);
        newIds.splice(newIndex, 0, nodeId);

        for (let i = 0; i < newIds.length; i++) {
          await tx.structureNode.update({
            where: { id: newIds[i] },
            data: {
              orderIndex: i,
              ...(newIds[i] === nodeId ? { parentId: resolvedNewParentId } : {}),
            },
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to move node", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Check if `possibleDescendantId` is a descendant of `ancestorId`. */
async function isDescendant(ancestorId: string, possibleDescendantId: string): Promise<boolean> {
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
