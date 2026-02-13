import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
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
    console.error("Failed to get node:", error);
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
    const existing = await prisma.structureNode.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, synopsis, status, orderIndex, parentId } = body;

    const validStatuses = ["OUTLINE", "DRAFT", "REVISED", "FINAL"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

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
    if (title !== undefined) data.title = title;
    if (synopsis !== undefined) data.synopsis = synopsis;
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
    console.error("Failed to update node:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
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
    console.error("Failed to delete node:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
