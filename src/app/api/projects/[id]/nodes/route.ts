import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const nodes = await prisma.structureNode.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      include: {
        contentVersions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { wordCount: true },
        },
      },
    });

    const result = nodes.map((node) => {
      const { contentVersions, ...rest } = node;
      return {
        ...rest,
        wordCount:
          node.type === "SCENE"
            ? (contentVersions[0]?.wordCount ?? 0)
            : undefined,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list nodes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { type, title, parentId, synopsis, status, insertAfterIndex } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: "type and title are required" },
        { status: 400 }
      );
    }

    const validTypes = ["PART", "CHAPTER", "SCENE"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const validStatuses = ["OUTLINE", "DRAFT", "REVISED", "FINAL"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    if (parentId) {
      const parentNode = await prisma.structureNode.findFirst({
        where: { id: parentId, projectId },
      });
      if (!parentNode) {
        return NextResponse.json(
          { error: "Parent node not found in this project" },
          { status: 400 }
        );
      }
    }

    // Calculate orderIndex
    let orderIndex: number;

    if (insertAfterIndex !== undefined && insertAfterIndex !== null) {
      orderIndex = insertAfterIndex + 1;

      // Shift siblings that are at or after the new index
      await prisma.structureNode.updateMany({
        where: {
          projectId,
          parentId: parentId ?? null,
          orderIndex: { gte: orderIndex },
        },
        data: { orderIndex: { increment: 1 } },
      });
    } else {
      // Append at the end
      const lastSibling = await prisma.structureNode.findFirst({
        where: { projectId, parentId: parentId ?? null },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      orderIndex = lastSibling ? lastSibling.orderIndex + 1 : 0;
    }

    const node = await prisma.structureNode.create({
      data: {
        projectId,
        type,
        title,
        parentId: parentId ?? null,
        synopsis: synopsis ?? "",
        status: status ?? "OUTLINE",
        orderIndex,
      },
    });

    // If this is a SCENE, create an initial empty ContentVersion
    if (type === "SCENE") {
      await prisma.contentVersion.create({
        data: {
          nodeId: node.id,
          content: "",
          wordCount: 0,
        },
      });
    }

    return NextResponse.json(node, { status: 201 });
  } catch (error) {
    console.error("Failed to create node:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
