import { prisma } from "@/lib/db";

function htmlToMarkdown(html: string): string {
    if (!html || html === "<p></p>") return "";

    let md = html;

    // Valid HTML comments for beats (<!-- beat: ... -->)
    // We strip these first to ensure they don't get mangled by the tag stripper
    md = md.replace(/<!-- beat: [\s\S]*?-->/g, "");

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
    md = md.replace(/&nbsp;/g, " ");

    return md.trim();
}

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

async function buildOutlineTree(projectId: string): Promise<OutlineNode[]> {
    const nodes = await prisma.structureNode.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
    });

    const sceneIds = nodes.filter((n) => n.type === "SCENE").map((n) => n.id);
    const contentMap: Record<string, string> = {};

    for (const sceneId of sceneIds) {
        const version = await prisma.contentVersion.findFirst({
            where: { nodeId: sceneId },
            orderBy: { createdAt: "desc" },
        });
        if (version) contentMap[sceneId] = version.content;
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

export async function exportManuscript(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const outline = await buildOutlineTree(projectId);

    const lines: string[] = [];
    lines.push(`# ${project.title}`);
    if (project.author) lines.push(`\n*by ${project.author}*`);
    if (project.genre) lines.push(`\n**Genre:** ${project.genre}`);
    if (project.synopsis) lines.push(`\n> ${project.synopsis}`);
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

export async function exportStoryBible(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const lines: string[] = [];
    lines.push(`# Story Bible: ${project.title}\n`);

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

    const relationships = await prisma.relationship.findMany({
        include: {
            fromNode: true,
            fromObject: true,
            toNode: true,
            toObject: true,
        },
    });

    const projectRelationships = relationships.filter((r) => {
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
            lines.push(
                `- ${fromName} **${rel.type.toLowerCase().replace(/_/g, " ")}** ${toName}${label}`
            );
        }
        lines.push("");
    }

    return lines.join("\n");
}

export async function getProjectSummary(projectId: string) {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
    });
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const nodes = await prisma.structureNode.findMany({
        where: { projectId },
        select: { type: true, status: true, id: true },
    });

    const nodesByType: Record<string, number> = {};
    const scenesByStatus: Record<string, number> = {};

    for (const node of nodes) {
        nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
        if (node.type === "SCENE") {
            scenesByStatus[node.status] = (scenesByStatus[node.status] || 0) + 1;
        }
    }

    const storyObjects = await prisma.storyObject.groupBy({
        by: ["type"],
        where: { projectId },
        _count: true,
    });

    const objectsByType: Record<string, number> = {};
    for (const group of storyObjects) {
        objectsByType[group.type] = group._count;
    }

    const sceneIds = nodes.filter((n) => n.type === "SCENE").map((n) => n.id);
    let totalWordCount = 0;

    if (sceneIds.length > 0) {
        const latestVersions = await Promise.all(
            sceneIds.map((id) =>
                prisma.contentVersion.findFirst({
                    where: { nodeId: id },
                    orderBy: { createdAt: "desc" },
                    select: { wordCount: true },
                })
            )
        );
        totalWordCount = latestVersions.reduce((sum, v) => sum + (v?.wordCount || 0), 0);
    }

    const objectIdsForCount = await prisma.storyObject.findMany({
        where: { projectId },
        select: { id: true },
    });
    const nodeIds = nodes.map((n) => n.id);
    const objIds = objectIdsForCount.map((o) => o.id);

    const relationshipCount = await prisma.relationship.count({
        where: {
            OR: [
                { fromNodeId: { in: nodeIds } },
                { fromObjectId: { in: objIds } },
                { toNodeId: { in: nodeIds } },
                { toObjectId: { in: objIds } },
            ],
        },
    });

    return {
        project: {
            id: project.id,
            title: project.title,
            author: project.author,
            synopsis: project.synopsis,
            genre: project.genre,
        },
        structure: {
            nodesByType,
            scenesByStatus,
        },
        storyObjects: objectsByType,
        relationshipCount,
        totalWordCount,
        updatedAt: project.updatedAt.toISOString(),
    };
}
