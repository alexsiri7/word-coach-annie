import { prisma } from "@/lib/db";
import { sanitizeInput } from "@/lib/sanitize-server";

export class ProjectsController {
    static async listProjects(limit: number = 20, offset: number = 0) {
        const [projects, total] = await Promise.all([
            prisma.project.findMany({
                orderBy: { updatedAt: "desc" },
                skip: offset,
                take: limit,
                include: {
                    _count: {
                        select: { structureNodes: true, storyObjects: true },
                    },
                },
            }),
            prisma.project.count(),
        ]);

        // Batch: get all scenes for all projects in one query
        const projectIds = projects.map((p) => p.id);
        const allScenes = await prisma.structureNode.findMany({
            where: { projectId: { in: projectIds }, type: "SCENE" },
            select: { id: true, projectId: true },
        });

        // Batch: get latest content version word counts for all scenes
        const sceneIds = allScenes.map((s) => s.id);
        const allVersions = sceneIds.length > 0
            ? await prisma.contentVersion.findMany({
                where: { nodeId: { in: sceneIds } },
                orderBy: { createdAt: "desc" },
                select: { nodeId: true, wordCount: true },
            })
            : [];

        // Build map: nodeId -> latest wordCount (first per nodeId due to orderBy desc)
        const latestWordCounts = new Map<string, number>();
        for (const v of allVersions) {
            if (!latestWordCounts.has(v.nodeId)) {
                latestWordCounts.set(v.nodeId, v.wordCount ?? 0);
            }
        }

        // Calculate word counts per project
        const projectWordCounts = new Map<string, number>();
        for (const scene of allScenes) {
            const current = projectWordCounts.get(scene.projectId) || 0;
            projectWordCounts.set(scene.projectId, current + (latestWordCounts.get(scene.id) || 0));
        }

        const result = projects.map((project) => ({
            id: project.id,
            title: project.title,
            author: project.author,
            synopsis: project.synopsis,
            genre: project.genre,
            projectType: project.projectType,
            wordCount: projectWordCounts.get(project.id) || 0,
            nodeCount: project._count.structureNodes,
            storyObjectCount: project._count.storyObjects,
            createdAt: project.createdAt.toISOString(),
            updatedAt: project.updatedAt.toISOString(),
        }));

        return { projects: result, total };
    }

    static async getProject(projectId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                _count: {
                    select: { structureNodes: true, storyObjects: true },
                },
            },
        });

        if (!project) throw new Error(`Project not found: ${projectId}`);

        // Calculate word count from latest content versions of all scenes
        const scenes = await prisma.structureNode.findMany({
            where: { projectId, type: "SCENE" },
            select: { id: true },
        });

        let wordCount = 0;
        if (scenes.length > 0) {
            const sceneIds = scenes.map((s) => s.id);
            const versions = await prisma.contentVersion.findMany({
                where: { nodeId: { in: sceneIds } },
                orderBy: { createdAt: "desc" },
                select: { nodeId: true, wordCount: true },
            });

            const latestWordCounts = new Map<string, number>();
            for (const v of versions) {
                if (!latestWordCounts.has(v.nodeId)) {
                    latestWordCounts.set(v.nodeId, v.wordCount ?? 0);
                }
            }

            for (const wc of latestWordCounts.values()) {
                wordCount += wc;
            }
        }

        return {
            id: project.id,
            title: project.title,
            author: project.author,
            synopsis: project.synopsis,
            genre: project.genre,
            projectType: project.projectType,
            wordCount,
            nodeCount: project._count.structureNodes,
            sceneCount: scenes.length,
            storyObjectCount: project._count.storyObjects,
            characterCount: project._count.storyObjects,
            archivedAt: project.archivedAt?.toISOString() ?? null,
            createdAt: project.createdAt.toISOString(),
            updatedAt: project.updatedAt.toISOString(),
        };
    }

    static async createProject(params: {
        title: string;
        author?: string;
        synopsis?: string;
        genre?: string;
        projectType?: string;
    }) {
        const { title, author, synopsis, genre, projectType } = params;

        if (!title || title.trim().length === 0) {
            throw new Error("Title is required");
        }

        const project = await prisma.project.create({
            data: {
                title: title.trim(),
                ...(author && { author: author.trim() }),
                ...(synopsis && { synopsis: synopsis.trim() }),
                ...(genre && { genre: genre.trim() }),
                ...(projectType && { projectType }),
            },
        });

        return {
            id: project.id,
            title: project.title,
            author: project.author,
            synopsis: project.synopsis,
            genre: project.genre,
            projectType: project.projectType,
            createdAt: project.createdAt.toISOString(),
        };
    }

    static async updateProject(
        projectId: string,
        data: { title?: string; author?: string; synopsis?: string; genre?: string; universeId?: string | null; projectType?: string }
    ) {
        const existing = await prisma.project.findUnique({ where: { id: projectId } });
        if (!existing) throw new Error(`Project not found: ${projectId}`);

        const updateData: Record<string, string> = {};
        if (data.title !== undefined) updateData.title = sanitizeInput(data.title.trim());
        if (data.author !== undefined) updateData.author = sanitizeInput(data.author.trim());
        if (data.synopsis !== undefined) updateData.synopsis = sanitizeInput(data.synopsis.trim());
        if (data.genre !== undefined) updateData.genre = sanitizeInput(data.genre.trim());
        if (data.projectType !== undefined) updateData.projectType = data.projectType;
        if (data.universeId !== undefined) (updateData as Record<string, unknown>).universeId = data.universeId;

        if (Object.keys(updateData).length === 0) {
            throw new Error("No fields to update");
        }

        const project = await prisma.project.update({
            where: { id: projectId },
            data: updateData,
        });

        return {
            id: project.id,
            title: project.title,
            author: project.author,
            synopsis: project.synopsis,
            genre: project.genre,
            projectType: project.projectType,
            updatedAt: project.updatedAt.toISOString(),
        };
    }
}
