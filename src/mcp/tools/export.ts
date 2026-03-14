import { prisma } from "@/lib/db";

interface MarkdownOptions {
    includeBeats?: boolean;
}

function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
    if (!html || html === "<p></p>") return "";

    let md = html;

    // Valid HTML comments for beats (<!-- beat: ... -->)
    if (!options.includeBeats) {
        md = md.replace(/<!-- beat: [\s\S]*?-->/g, "");
    }

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

export async function exportManuscript(projectId: string, options: MarkdownOptions = {}): Promise<string> {
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
                const md = htmlToMarkdown(node.content, options);
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

export async function exportMedium(projectId: string, nodeId?: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const where: any = { projectId };
    if (nodeId) {
        where.id = nodeId;
    } else {
        where.type = "SCENE"; // Default to exporting all scenes/articles if no specific node requested
    }

    // If nodeId is provided, we fetch that specific node. 
    // If not, we fetch all SCENE nodes ordered by index.
    const nodes = await prisma.structureNode.findMany({
        where,
        orderBy: { orderIndex: "asc" },
    });

    if (nodes.length === 0) return "";

    const lines: string[] = [];

    for (const node of nodes) {
        // Only valid for SCENE/ARTICLE nodes usually, but if nodeId points to a CHAPTER, we might want to export its children? 
        // For now let's assume we are exporting leaves (SCENES).
        // If the user requested a CHAPTER node, we should get its children.
        if (node.type !== "SCENE" && nodeId) {
            // If a non-scene node is requested, fetch its children scenes
            const children = await prisma.structureNode.findMany({
                where: { parentId: node.id, type: "SCENE" },
                orderBy: { orderIndex: "asc" },
            });
            // Recursively call or just loop here? Let's just loop for 1 level depth for now.
            // Actually, the requirement says "formats a single node".
            // Let's stick to modifying the query to include children if needed, or just fail if it's not a scene?
            // "Support non-fiction... Article Collection... Chapter becomes Article".
            // In Article Collection, "Chapter" (Article) contains "Scenes" (Sections)? 
            // Or is "Chapter" the Article?
            // In `types.ts`, `CHAPTER` maps to "Article" in `ARTICLE_COLLECTION`.
            // So `SCENE` maps to "Section".
            // If I export an "Article" (Chapter), I want all its "Sections" (Scenes).
        }

        // Re-fetching to handle the hierarchy correctly if we want to support exporting an "Article" (Chapter) with all its sections.
        // Let's implement a helper to get content for a node.
    }

    // Simplified approach: Build the tree, then traverse.
    const outline = await buildOutlineTree(projectId);

    // Helper to collect markdown for a node and its children
    const collectMarkdown = (n: OutlineNode): string[] => {
        const result: string[] = [];
        if (n.type === "SCENE" && n.content) {
            // Medium format header for the section
            // result.push(`## ${n.title}\n`); // Maybe? or just content?
            // If it's an Article Collection, the SCENE is a Section. 
            // The CHAPTER is the Article.

            // Let's use the standard htmlToMarkdown but maybe adding a separator.
            const md = htmlToMarkdown(n.content);
            if (md) result.push(md);
        } else if (n.children.length > 0) {
            // It's a container (Part/Chapter/Article)
            // We usually want the title of the Article to be the H1.
            // But if we are exporting *multiple* articles, we might want them separated?

            // If we are exporting a specific node `nodeId`:
            // If it's a CHAPTER (Article), we output `# Title` then its scenes.

            // Let's iterate.
            if (n.type === "CHAPTER" || n.type === "PART") {
                result.push(`# ${n.title}\n`);
                for (const child of n.children) {
                    result.push(...collectMarkdown(child));
                }
            }
        }
        return result;
    }

    // Filter outline if nodeId is present
    let targetNodes = outline;
    if (nodeId) {
        const findNode = (nodes: OutlineNode[]): OutlineNode | null => {
            for (const n of nodes) {
                if (n.id === nodeId) return n;
                const found = findNode(n.children);
                if (found) return found;
            }
            return null;
        };
        const found = findNode(outline);
        targetNodes = found ? [found] : [];
    }

    // Generate output
    for (const node of targetNodes) {
        // Prepare Medium Front Matter if it's a root-ish node (Chapter/Article)
        if (node.type === "CHAPTER" || (nodeId && node.id === nodeId)) {
            lines.push(`---`);
            lines.push(`title: "${node.title}"`);
            if (node.synopsis) lines.push(`description: "${node.synopsis}"`);
            lines.push(`---`);
            lines.push("");
        }

        // If it's just a raw list of scenes (e.g. exporting whole project), this might be messy with multiple front matters.
        // But for "Article Collection", each Chapter is an Article.
        // We probably want to export them strictly one by one usually. 
        // But if requesting full project, let's just dump them separated.

        lines.push(...collectMarkdown(node));
        lines.push("\n\n");
    }

    return lines.join("\n").trim();
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
        const allVersions = await prisma.contentVersion.findMany({
            where: { nodeId: { in: sceneIds } },
            orderBy: { createdAt: "desc" },
            select: { nodeId: true, wordCount: true },
        });

        // First match per nodeId is latest due to orderBy desc
        const seen = new Set<string>();
        for (const v of allVersions) {
            if (!seen.has(v.nodeId)) {
                seen.add(v.nodeId);
                totalWordCount += v.wordCount ?? 0;
            }
        }
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

export async function exportUniverse(universeId: string): Promise<string> {
    const universe = await prisma.universe.findUnique({
        where: { id: universeId },
        include: {
            worldObjects: {
                include: {
                    timeline: {
                        orderBy: { orderIndex: 'asc' }
                    }
                },
                orderBy: [{ type: 'asc' }, { name: 'asc' }]
            }
        }
    });

    if (!universe) throw new Error(`Universe not found: ${universeId}`);

    const lines: string[] = [];
    lines.push(`# Universe: ${universe.title}\n`);
    if (universe.description) lines.push(`> ${universe.description}\n`);
    lines.push("---\n");

    const grouped: Record<string, typeof universe.worldObjects> = {};
    for (const obj of universe.worldObjects) {
        if (!grouped[obj.type]) grouped[obj.type] = [];
        grouped[obj.type].push(obj);
    }

    const typeLabels: Record<string, string> = {
        CHARACTER: "Characters",
        LOCATION: "Locations",
        WORLD_ELEMENT: "World Elements",
    };

    for (const [type, label] of Object.entries(typeLabels)) {
        const objects = grouped[type];
        if (!objects || objects.length === 0) continue;

        lines.push(`\n## ${label}\n`);
        for (const obj of objects) {
            lines.push(`### ${obj.name}\n`);
            if (obj.description) lines.push(`${obj.description}\n`);
            if (obj.tags) lines.push(`**Tags:** ${obj.tags}\n`);
            if (obj.notes) lines.push(`*Notes:* ${obj.notes}\n`);

            if (obj.timeline.length > 0) {
                lines.push(`\n**Timeline:**\n`);
                for (const entry of obj.timeline) {
                    lines.push(`- **${entry.label}**: ${entry.description}`);
                }
                lines.push("");
            }
            lines.push("---\n");
        }
    }

    return lines.join("\n");
}
