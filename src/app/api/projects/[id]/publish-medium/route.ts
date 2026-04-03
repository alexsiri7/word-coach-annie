import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

interface OutlineNode {
  id: string;
  type: string;
  title: string;
  synopsis: string;
  status: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
}

function htmlToMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";

  let md = html;
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u>(.*?)<\/u>/gi, "$1");
  md = md.replace(/<ul[^>]*>/gi, "");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<ol[^>]*>/gi, "");
  md = md.replace(/<\/ol>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&ldquo;/g, "\u201C");
  md = md.replace(/&rdquo;/g, "\u201D");
  md = md.replace(/&mdash;/g, "\u2014");
  md = md.replace(/&ndash;/g, "\u2013");
  md = md.replace(/&nbsp;/g, " ");

  return md.trim();
}

async function buildOutlineTree(projectId: string): Promise<OutlineNode[]> {
  const nodes = await prisma.structureNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });

  const sceneIds = nodes.filter((n: { type: string }) => n.type === "SCENE").map((n: { id: string }) => n.id);
  const contentMap: Record<string, string> = {};

  if (sceneIds.length > 0) {
    const allVersions = await prisma.contentVersion.findMany({
      where: { nodeId: { in: sceneIds } },
      orderBy: { createdAt: "desc" },
    });
    for (const v of allVersions) {
      if (!contentMap[v.nodeId]) {
        contentMap[v.nodeId] = v.content;
      }
    }
  }

  const nodeMap: Record<string, OutlineNode> = {};
  for (const n of nodes) {
    nodeMap[n.id] = {
      id: n.id,
      type: n.type,
      title: n.title,
      synopsis: n.synopsis || "",
      status: n.status,
      orderIndex: n.orderIndex,
      parentId: n.parentId,
      children: [],
      content: contentMap[n.id],
    };
  }

  const roots: OutlineNode[] = [];
  for (const n of nodes) {
    if (n.parentId && nodeMap[n.parentId]) {
      nodeMap[n.parentId].children.push(nodeMap[n.id]);
    } else {
      roots.push(nodeMap[n.id]);
    }
  }

  return roots;
}

function buildMarkdown(
  project: { title: string; author: string; synopsis: string; genre: string },
  outline: OutlineNode[]
): string {
  const lines: string[] = [];

  lines.push(`# ${project.title}`);
  if (project.author) lines.push(`\n*by ${project.author}*`);
  lines.push("\n---\n");

  let chapterNum = 0;

  function renderNode(node: OutlineNode) {
    if (node.type === "PART") {
      lines.push(`\n# ${node.title}\n`);
      for (const child of node.children) renderNode(child);
    } else if (node.type === "CHAPTER") {
      chapterNum++;
      lines.push(`\n## Chapter ${chapterNum}: ${node.title}\n`);
      for (const child of node.children) renderNode(child);
    } else if (node.type === "SCENE") {
      if (node.content) {
        const md = htmlToMarkdown(node.content);
        if (md) {
          lines.push(md);
          lines.push("\n\n---\n");
        }
      }
    }
  }

  for (const node of outline) renderNode(node);

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectReadAccess(id, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const body = await request.json();
    const { title, tags, publishStatus = "draft" } = body as {
      title?: string;
      tags?: string[];
      publishStatus?: "public" | "draft" | "unlisted";
    };

    // Validate publishStatus
    if (!["public", "draft", "unlisted"].includes(publishStatus)) {
      return NextResponse.json({ error: "Invalid publishStatus" }, { status: 400 });
    }

    // Get Medium credentials
    const cred = await prisma.mediumCredential.findFirst();
    if (!cred) {
      return NextResponse.json({ error: "Medium is not connected. Connect your account in Settings." }, { status: 400 });
    }

    const token = decrypt(cred.integrationToken);

    // Get project
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Build content
    const outline = await buildOutlineTree(id);
    const content = buildMarkdown(
      { title: project.title, author: project.author || "", synopsis: project.synopsis || "", genre: project.genre || "" },
      outline
    );

    const postTitle = title || project.title;

    // Publish to Medium
    const mediumRes = await fetch(`https://api.medium.com/v1/users/${cred.authorId}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        title: postTitle,
        contentFormat: "markdown",
        content,
        tags: tags ?? [],
        publishStatus,
      }),
    });

    if (!mediumRes.ok) {
      const errBody = await mediumRes.text();
      logger.error("[publish-medium] Medium API error", { status: mediumRes.status, body: errBody });
      return NextResponse.json({ error: "Failed to publish to Medium. Please try again." }, { status: 502 });
    }

    const mediumData = await mediumRes.json();
    const postUrl: string = mediumData.data?.url ?? "";

    return NextResponse.json({ published: true, url: postUrl });
  } catch (error) {
    logger.error("POST /api/projects/[id]/publish-medium error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
