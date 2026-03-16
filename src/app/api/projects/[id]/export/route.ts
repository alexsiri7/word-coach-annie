import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { exportProjectJson } from "@/lib/export-json";

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

interface ExportOptions {
  includeSynopsis: boolean;
  includeSceneBreaks: boolean;
  chapterNumbering: boolean;
}

function htmlToMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";

  let md = html;
  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  // Bold, italic, underline
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u>(.*?)<\/u>/gi, "$1");
  // Lists
  md = md.replace(/<ul[^>]*>/gi, "");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<ol[^>]*>/gi, "");
  md = md.replace(/<\/ol>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  // Paragraphs and breaks
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, "");
  // Clean up whitespace
  md = md.replace(/\n{3,}/g, "\n\n");
  // Decode entities
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

  // Batch: get latest content for all scenes in one query
  const sceneIds = nodes.filter((n: { type: string }) => n.type === "SCENE").map((n: { id: string }) => n.id);
  const contentMap: Record<string, string> = {};

  if (sceneIds.length > 0) {
    const allVersions = await prisma.contentVersion.findMany({
      where: { nodeId: { in: sceneIds } },
      orderBy: { createdAt: "desc" },
      select: { nodeId: true, content: true },
    });

    // First match per nodeId is latest due to orderBy desc
    for (const v of allVersions) {
      if (!(v.nodeId in contentMap)) {
        contentMap[v.nodeId] = v.content;
      }
    }
  }

  // Build tree
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

function exportFullManuscript(
  project: { title: string; author: string; synopsis: string; genre: string },
  outline: OutlineNode[],
  options: ExportOptions = { includeSynopsis: true, includeSceneBreaks: true, chapterNumbering: true }
): string {
  const lines: string[] = [];

  // Front matter
  lines.push(`# ${project.title}`);
  if (project.author) lines.push(`\n*by ${project.author}*`);
  if (project.genre) lines.push(`\n**Genre:** ${project.genre}`);
  if (options.includeSynopsis && project.synopsis) lines.push(`\n> ${project.synopsis}`);
  lines.push("\n---\n");

  let chapterNum = 0;

  function renderNode(node: OutlineNode, depth: number) {
    if (node.type === "PART") {
      lines.push(`\n# ${node.title}\n`);
      if (options.includeSynopsis && node.synopsis) {
        lines.push(`> ${node.synopsis}\n`);
      }
      for (const child of node.children) {
        renderNode(child, depth + 1);
      }
    } else if (node.type === "CHAPTER") {
      chapterNum++;
      const heading = options.chapterNumbering
        ? `\n## Chapter ${chapterNum}: ${node.title}\n`
        : `\n## ${node.title}\n`;
      lines.push(heading);
      if (options.includeSynopsis && node.synopsis) {
        lines.push(`> ${node.synopsis}\n`);
      }
      for (const child of node.children) {
        renderNode(child, depth + 1);
      }
    } else if (node.type === "SCENE") {
      if (options.includeSynopsis && node.synopsis) {
        lines.push(`*${node.synopsis}*\n`);
      }
      if (node.content) {
        const md = htmlToMarkdown(node.content);
        if (md) {
          lines.push(md);
          if (options.includeSceneBreaks) {
            lines.push("\n\n---\n");
          } else {
            lines.push("\n");
          }
        }
      }
    }
  }

  for (const node of outline) {
    renderNode(node, 0);
  }

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

function exportChapters(
  project: { title: string },
  outline: OutlineNode[],
  options: ExportOptions
): { filename: string; content: string }[] {
  const chapters: { filename: string; content: string }[] = [];
  let chapterNum = 0;

  function collectChapters(nodes: OutlineNode[]) {
    for (const node of nodes) {
      if (node.type === "PART") {
        collectChapters(node.children);
      } else if (node.type === "CHAPTER") {
        chapterNum++;
        const lines: string[] = [];
        const heading = options.chapterNumbering
          ? `# Chapter ${chapterNum}: ${node.title}`
          : `# ${node.title}`;
        lines.push(heading);
        if (options.includeSynopsis && node.synopsis) {
          lines.push(`\n> ${node.synopsis}`);
        }
        lines.push("\n");

        for (const scene of node.children) {
          if (scene.type === "SCENE" && scene.content) {
            if (options.includeSynopsis && scene.synopsis) {
              lines.push(`*${scene.synopsis}*\n`);
            }
            const md = htmlToMarkdown(scene.content);
            if (md) {
              lines.push(md);
              if (options.includeSceneBreaks) {
                lines.push("\n\n---\n");
              } else {
                lines.push("\n");
              }
            }
          }
        }

        const safeTitle = node.title.replace(/[^a-zA-Z0-9]/g, "_");
        const numStr = String(chapterNum).padStart(2, "0");
        chapters.push({
          filename: `${numStr}_${safeTitle}.md`,
          content: lines.join("\n").replace(/\n{4,}/g, "\n\n\n"),
        });
      }
    }
  }

  collectChapters(outline);
  return chapters;
}

async function exportStoryBible(projectId: string, projectTitle: string): Promise<string> {
  const lines: string[] = [];
  lines.push(`# Story Bible: ${projectTitle}\n`);

  const storyObjects = await prisma.storyObject.findMany({
    where: { projectId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const grouped: Record<string, typeof storyObjects> = {};
  for (const obj of storyObjects) {
    if (!grouped[obj.type]) grouped[obj.type] = [];
    grouped[obj.type].push(obj);
  }

  const typeLabels: Record<string, string> = {
    CHARACTER: "Characters",
    LOCATION: "Locations",
    PLOTLINE: "Plotlines",
    WORLD_ELEMENT: "World Elements",
    NOTE: "Notes",
  };

  for (const [type, label] of Object.entries(typeLabels)) {
    const objects = grouped[type];
    if (!objects || objects.length === 0) continue;

    lines.push(`\n## ${label}\n`);

    for (const obj of objects) {
      lines.push(`### ${obj.name}\n`);
      if (obj.role) lines.push(`**Role:** ${obj.role}\n`);
      if (obj.tags) lines.push(`**Tags:** ${obj.tags}\n`);
      if (obj.description) lines.push(`${obj.description}\n`);
      if (obj.notes) lines.push(`*Notes:* ${obj.notes}\n`);
      lines.push("");
    }
  }

  // Add relationships
  const relationships = await prisma.relationship.findMany({
    include: {
      fromNode: true,
      fromObject: true,
      toNode: true,
      toObject: true,
    },
  });

  // Filter to only this project's relationships
  const projectRelationships = relationships.filter((r: { fromNode?: { projectId: string } | null; fromObject?: { projectId: string } | null; toNode?: { projectId: string } | null; toObject?: { projectId: string } | null }) => {
    const fromProjectId = r.fromNode?.projectId || r.fromObject?.projectId;
    const toProjectId = r.toNode?.projectId || r.toObject?.projectId;
    return fromProjectId === projectId || toProjectId === projectId;
  });

  if (projectRelationships.length > 0) {
    lines.push(`\n## Relationships\n`);
    for (const rel of projectRelationships) {
      const fromName = rel.fromNode?.title || rel.fromObject?.name || "?";
      const toName = rel.toNode?.title || rel.toObject?.name || "?";
      const label = rel.label ? ` (${rel.label})` : "";
      lines.push(`- ${fromName} **${rel.type.toLowerCase().replace(/_/g, " ")}** ${toName}${label}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectAccess(id, userId);
  if (!access.authorized) return access.response;

  const searchParams = request.nextUrl.searchParams;

  // Accept both "format" and "type" params for compatibility
  const format = searchParams.get("format") || searchParams.get("type") || "full";

  // Parse export options
  const options: ExportOptions = {
    includeSynopsis: searchParams.get("includeSynopsis") !== "false",
    includeSceneBreaks: searchParams.get("includeSceneBreaks") !== "false",
    chapterNumbering: searchParams.get("chapterNumbering") !== "false",
  };

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Map aliases: "manuscript" -> "full", "story-bible" -> "bible"
  let resolvedFormat = format;
  if (format === "manuscript") resolvedFormat = "full";
  if (format === "story-bible") resolvedFormat = "bible";

  // JSON export
  if (resolvedFormat === "json") {
    const data = await exportProjectJson(id);
    const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (resolvedFormat === "bible") {
    const markdown = await exportStoryBible(id, project.title);
    const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}_story_bible.md`;
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  if (resolvedFormat === "chapters") {
    const outline = await buildOutlineTree(id);
    const chapters = exportChapters(project, outline, options);
    return NextResponse.json({ chapters });
  }

  // Default: full manuscript
  const outline = await buildOutlineTree(id);
  const markdown = exportFullManuscript(project, outline, options);
  const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
