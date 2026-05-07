import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectReadAccessByNode, verifyProjectWriteAccessByNode } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { NodeUpdateSchema } from "@/schemas/nodes";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = getCurrentUserId(request);
    const access = await verifyProjectReadAccessByNode(id, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;
    const node = await prisma.structureNode.findUnique({
      where: { id },
      include: {
        contentVersions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const { contentVersions, ...rest } = node;
    const result: Record<string, unknown> = { ...rest };

    if (node.type === "SCENE" && contentVersions.length > 0) {
      result.latestContent = contentVersions[0];
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to get node", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = getCurrentUserId(request);
    const nodeAccess = await verifyProjectWriteAccessByNode(id, userId, request.headers.get("x-user-email"));
    if (!nodeAccess.authorized) return nodeAccess.response;

    const existing = await prisma.structureNode.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = NodeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { title, synopsis, status, orderIndex, parentId } = parsed.data;

    if (parentId !== undefined && parentId !== null) {
      const parentNode = await prisma.structureNode.findFirst({
        where: { id: parentId, projectId: existing.projectId },
      });
      if (!parentNode) {
        return NextResponse.json(
          { error: "Parent node not found in this project" },
          { status: 400 }
        );
      }
      if (parentId === id) {
        return NextResponse.json(
          { error: "A node cannot be its own parent" },
          { status: 400 }
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = sanitizeInput(title);
    if (synopsis !== undefined) data.synopsis = sanitizeInput(synopsis);
    if (status !== undefined) data.status = status;
    if (orderIndex !== undefined) data.orderIndex = orderIndex;
    if (parentId !== undefined) data.parentId = parentId;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.structureNode.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Failed to update node", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = getCurrentUserId(request);
    const nodeAccess = await verifyProjectWriteAccessByNode(id, userId, request.headers.get("x-user-email"));
    if (!nodeAccess.authorized) return nodeAccess.response;

    const node = await prisma.structureNode.findUnique({
      where: { id },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    // Delete the node (cascade handles children, content versions, relationships)
    await prisma.structureNode.delete({
      where: { id },
    });

    // Reindex remaining siblings
    const siblings = await prisma.structureNode.findMany({
      where: {
        projectId: node.projectId,
        parentId: node.parentId,
      },
      orderBy: { orderIndex: "asc" },
      select: { id: true },
    });

    for (let i = 0; i < siblings.length; i++) {
      await prisma.structureNode.update({
        where: { id: siblings[i].id },
        data: { orderIndex: i },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete node", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
