import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { exportProjectJson } from "@/lib/export-json";
import { logger } from "@/lib/logger";
import { htmlToMarkdown } from "@/lib/html-to-markdown";
import { buildOutlineTree, OutlineNode } from "@/lib/outline-tree";

interface ExportOptions {
  includeSynopsis: boolean;
  includeSceneBreaks: boolean;
  chapterNumbering: boolean;
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

  // Add relationships scoped to this project's nodes and objects
  const nodeIds = (await prisma.structureNode.findMany({
    where: { projectId },
    select: { id: true },
  })).map((n) => n.id);
  const objectIds = storyObjects.map((o) => o.id);

  const projectRelationships = await prisma.relationship.findMany({
    where: {
      OR: [
        { fromNodeId: { in: nodeIds } },
        { toNodeId: { in: nodeIds } },
        { fromObjectId: { in: objectIds } },
        { toObjectId: { in: objectIds } },
      ],
    },
    include: {
      fromNode: true,
      fromObject: true,
      toNode: true,
      toObject: true,
    },
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
  try {
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
  } catch (error) {
    logger.error("GET /api/projects/[id]/export error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
