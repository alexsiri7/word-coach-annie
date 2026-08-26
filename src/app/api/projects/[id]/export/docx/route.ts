import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from "docx";
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

function stripHtml(html: string): string {
  if (!html || html === "<p></p>") return "";
  let text = html;
  // Remove beat comments
  text = text.replace(/<!--\s*beat:.*?-->/gi, "");
  // Replace paragraphs/breaks with newlines
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// NOTE: buildOutlineTree is duplicated from src/lib/outline-tree.ts (also in pdf/route.tsx,
// epub/route.ts, and export/route.ts). The shared module exists but these routes haven't
// been migrated to use it yet. If logic changes, update all copies.
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

function headingParagraph(title: string, size: number): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: title, font: "Arial", size, bold: true })],
    alignment: AlignmentType.LEFT,
  });
}

function buildDocxParagraphs(nodes: OutlineNode[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  function walk(node: OutlineNode) {
    if (node.type === "PART" || node.type === "CHAPTER") {
      const size = node.type === "PART" ? 32 : 28;
      paragraphs.push(headingParagraph(node.title, size));
      for (const child of node.children) walk(child);
    } else if (node.type === "SCENE" && node.content) {
      const text = stripHtml(node.content);
      if (text) {
        for (const block of text.split("\n\n")) {
          const trimmed = block.trim();
          if (trimmed) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun({ text: trimmed, font: "Arial", size: 24 })],
                alignment: AlignmentType.LEFT,
              })
            );
          }
        }
      }
    }
  }

  for (const node of nodes) walk(node);
  return paragraphs;
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

    const titleParagraphs: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: project.title, font: "Arial", size: 32, bold: true })],
        alignment: AlignmentType.LEFT,
      }),
    ];
    if (project.author) {
      titleParagraphs.push(
        new Paragraph({
          children: [new TextRun({ text: project.author, font: "Arial", size: 24 })],
          alignment: AlignmentType.LEFT,
        })
      );
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [...titleParagraphs, ...buildDocxParagraphs(outline)],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("GET /api/projects/[id]/export/docx error", error);
    const debugMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    return NextResponse.json(
      { error: "Internal server error", _debug: debugMsg },
      { status: 500 }
    );
  }
}
