import { NextRequest, NextResponse } from "next/server";
import epub from "epub-gen-memory";
import { prisma } from "@/lib/db";
import { buildOutlineTree, type OutlineNode } from "@/lib/outline-tree";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { escapeHtml } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

function stripBeats(html: string): string {
  return html.replace(/<!--\s*beat:.*?-->/gi, "");
}

function isEmptyContent(content: string | undefined): boolean {
  if (!content) return true;
  const stripped = content.replace(/<p><\/p>/g, "").trim();
  return stripped.length === 0;
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
      const partSceneHtml = collectSceneHtml(node);
      chapters.push({
        title: node.title,
        content: `<h1>${escapeHtml(node.title)}</h1>${partSceneHtml}`,
      });
      for (const child of node.children) {
        if (child.type !== "SCENE") walk(child);
      }
    } else if (node.type === "CHAPTER") {
      const sceneHtml = collectSceneHtml(node);
      chapters.push({
        title: node.title,
        content: `<h2>${escapeHtml(node.title)}</h2>${sceneHtml}`,
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
