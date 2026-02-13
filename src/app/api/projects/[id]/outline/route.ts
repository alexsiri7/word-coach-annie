import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface OutlineNode {
  id: string;
  projectId: string;
  parentId: string | null;
  type: string;
  title: string;
  synopsis: string;
  status: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
  wordCount?: number;
  children: OutlineNode[];
}

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

    // Build a map of id -> OutlineNode
    const nodeMap = new Map<string, OutlineNode>();

    for (const node of nodes) {
      const { contentVersions, ...rest } = node;
      nodeMap.set(node.id, {
        ...rest,
        wordCount:
          node.type === "SCENE"
            ? (contentVersions[0]?.wordCount ?? 0)
            : undefined,
        children: [],
      });
    }

    // Build tree
    const roots: OutlineNode[] = [];

    for (const node of nodes) {
      const outlineNode = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(outlineNode);
      } else {
        roots.push(outlineNode);
      }
    }

    return NextResponse.json(roots);
  } catch (error) {
    console.error("Failed to build outline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
