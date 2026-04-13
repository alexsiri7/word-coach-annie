import { NextRequest, NextResponse } from "next/server";
import epub from "epub-gen-memory";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

interface OutlineNode {
  id: string;
  type: string;
  title: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
}

function stripBeats(html: string): string {
  return html.replace(/<!--\s*beat:.*?-->/gi, "");
}

function isEmptyContent(content: string | undefined): boolean {
  if (!content) return true;
  const stripped = content.replace(/<p><\/p>/g, "").trim();
  return stripped.length === 0;
}

async function buildOutlineTree(projectId: string): Promise<OutlineNode[]> {
  const nodes = await prisma.structureNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });

  const sceneIds = nodes
    .filter((n: { type: string }) => n.type === "SCENE")
    .map((n: { id: string }) => n.id);
  const contentMap: Record<string, string> = {};

  if (sceneIds.length > 0) {
    const allVersions = await prisma.contentVersion.findMany({
      where: { nodeId: { in: sceneIds } },
      orderBy: { createdAt: "desc" },
      select: { nodeId: true, content: true },
    });

    for (const v of allVersions) {
      if (!(v.nodeId in contentMap)) {
        contentMap[v.nodeId] = v.content;
      }
    }
  }

  const nodeMap = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  for (const node of nodes) {
    nodeMap.set(node.id, {
      ...node,
      children: [],
      content: contentMap[node.id],
    });
  }

  for (const node of nodes) {
    const outlineNode = nodeMap.get(node.id)!;
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(outlineNode);
    } else {
      roots.push(outlineNode);
    }
  }

  return roots;
}

interface EpubChapter {
  title: string;
  content: string;
}

function buildEpubChapters(outline: OutlineNode[]): EpubChapter[] {
  const chapters: EpubChapter[] = [];

  function collectSceneHtml(node: OutlineNode): string {
    let html = "";
    for (const child of node.children) {
      if (child.type === "SCENE" && !isEmptyContent(child.content)) {
        html += stripBeats(child.content!);
      }
    }
    return html;
  }

  function walk(node: OutlineNode) {
    if (node.type === "PART") {
      // Add part as separator chapter
      const partSceneHtml = collectSceneHtml(node);
      if (partSceneHtml) {
        chapters.push({
          title: node.title,
          content: `<h1>${node.title}</h1>${partSceneHtml}`,
        });
      } else {
        chapters.push({
          title: node.title,
          content: `<h1>${node.title}</h1>`,
        });
      }
      for (const child of node.children) {
        if (child.type !== "SCENE") walk(child);
      }
    } else if (node.type === "CHAPTER") {
      const sceneHtml = collectSceneHtml(node);
      chapters.push({
        title: node.title,
        content: `<h2>${node.title}</h2>${sceneHtml}`,
      });
    } else if (node.type === "SCENE" && !isEmptyContent(node.content)) {
      // Top-level scene (no parent chapter)
      chapters.push({
        title: node.title,
        content: stripBeats(node.content!),
      });
    }
  }

  for (const node of outline) walk(node);
  return chapters;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const userEmail = request.headers.get("x-user-email");
    const access = await verifyProjectReadAccess(id, userId, userEmail);
    if (!access.authorized) return access.response;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const outline = await buildOutlineTree(id);
    const chapters = buildEpubChapters(outline);

    const buffer = await epub(
      {
        title: project.title,
        author: project.author || "Unknown",
      },
      chapters
    );

    const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}.epub`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("GET /api/projects/[id]/export/epub error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
