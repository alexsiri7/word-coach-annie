import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

interface ManuscriptScene {
  title: string;
  content: string;
}

interface ManuscriptChapter {
  title: string;
  scenes: ManuscriptScene[];
}

interface ManuscriptPart {
  title: string;
  chapters: ManuscriptChapter[];
}

interface ManuscriptResponse {
  title: string;
  author: string;
  chapters?: ManuscriptChapter[];
  parts?: ManuscriptPart[];
}

// GET /api/projects/[id]/manuscript - Full manuscript as structured JSON (owner + reader)
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const userEmail = request.headers.get("x-user-email");
    const access = await verifyProjectReadAccess(id, userId, userEmail);
    if (!access.authorized) return access.response;

    const project = await prisma.project.findUnique({
      where: { id },
      select: { title: true, author: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Fetch all structure nodes for the project, ordered for hierarchy
    const nodes = await prisma.structureNode.findMany({
      where: { projectId: id },
      select: {
        id: true,
        parentId: true,
        type: true,
        title: true,
        orderIndex: true,
      },
      orderBy: { orderIndex: "asc" },
    });

    // Get latest content for all scenes in one query
    const sceneIds = nodes.filter((n) => n.type === "SCENE").map((n) => n.id);
    const contentVersions =
      sceneIds.length > 0
        ? await prisma.contentVersion.findMany({
            where: { nodeId: { in: sceneIds } },
            orderBy: { createdAt: "desc" },
            select: { nodeId: true, content: true },
          })
        : [];

    // Map: nodeId -> latest content (first match is latest due to orderBy desc)
    const latestContent = new Map<string, string>();
    for (const cv of contentVersions) {
      if (!latestContent.has(cv.nodeId)) {
        latestContent.set(cv.nodeId, cv.content);
      }
    }

    // Build lookup maps
    const childrenMap = new Map<string | null, typeof nodes>();
    for (const node of nodes) {
      const key = node.parentId;
      if (!childrenMap.has(key)) childrenMap.set(key, []);
      childrenMap.get(key)!.push(node);
    }

    const topLevel = childrenMap.get(null) ?? [];

    function buildScene(node: (typeof nodes)[0]): ManuscriptScene {
      return {
        title: node.title,
        content: latestContent.get(node.id) ?? "",
      };
    }

    function buildChapter(node: (typeof nodes)[0]): ManuscriptChapter {
      const children = childrenMap.get(node.id) ?? [];
      return {
        title: node.title,
        scenes: children
          .filter((c) => c.type === "SCENE")
          .map(buildScene),
      };
    }

    // Determine structure: has parts, or just chapters, or just scenes
    const hasParts = topLevel.some((n) => n.type === "PART");
    const hasChapters = topLevel.some((n) => n.type === "CHAPTER");

    const result: ManuscriptResponse = {
      title: project.title,
      author: project.author,
    };

    if (hasParts) {
      result.parts = topLevel
        .filter((n) => n.type === "PART")
        .map((part) => {
          const partChildren = childrenMap.get(part.id) ?? [];
          return {
            title: part.title,
            chapters: partChildren
              .filter((c) => c.type === "CHAPTER")
              .map(buildChapter),
          };
        });
    } else if (hasChapters) {
      result.chapters = topLevel
        .filter((n) => n.type === "CHAPTER")
        .map(buildChapter);
    } else {
      // Flat scenes at top level
      result.chapters = [
        {
          title: project.title,
          scenes: topLevel
            .filter((n) => n.type === "SCENE")
            .map(buildScene),
        },
      ];
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("GET /api/projects/[id]/manuscript error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
