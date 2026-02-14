import { prisma } from "@/lib/db";

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

        const result = await Promise.all(
            projects.map(async (project: any) => {
                const scenes = await prisma.structureNode.findMany({
                    where: { projectId: project.id, type: "SCENE" },
                    select: { id: true },
                });

                let wordCount = 0;
                if (scenes.length > 0) {
                    const latestVersions = await Promise.all(
                        scenes.map((scene: any) =>
                            prisma.contentVersion.findFirst({
                                where: { nodeId: scene.id },
                                orderBy: { createdAt: "desc" },
                                select: { wordCount: true },
                            })
                        )
                    );
                    wordCount = latestVersions.reduce((sum: number, v: any) => sum + (v?.wordCount || 0), 0);
                }

                return {
                    id: project.id,
                    title: project.title,
                    author: project.author,
                    synopsis: project.synopsis,
                    genre: project.genre,
                    wordCount,
                    nodeCount: project._count.structureNodes,
                    storyObjectCount: project._count.storyObjects,
                    createdAt: project.createdAt.toISOString(),
                    updatedAt: project.updatedAt.toISOString(),
                };
            })
        );

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

        return {
            id: project.id,
            title: project.title,
            author: project.author,
            synopsis: project.synopsis,
            genre: project.genre,
            nodeCount: project._count.structureNodes,
            storyObjectCount: project._count.storyObjects,
            createdAt: project.createdAt.toISOString(),
            updatedAt: project.updatedAt.toISOString(),
        };
    }

    static async createProject(params: {
        title: string;
        author?: string;
        synopsis?: string;
        genre?: string;
    }) {
        const { title, author, synopsis, genre } = params;

        if (!title || title.trim().length === 0) {
            throw new Error("Title is required");
        }

        const project = await prisma.project.create({
            data: {
                title: title.trim(),
                ...(author && { author: author.trim() }),
                ...(synopsis && { synopsis: synopsis.trim() }),
                ...(genre && { genre: genre.trim() }),
            },
        });

        return {
            id: project.id,
            title: project.title,
            author: project.author,
            synopsis: project.synopsis,
            genre: project.genre,
            createdAt: project.createdAt.toISOString(),
        };
    }

    static async updateProject(
        projectId: string,
        data: { title?: string; author?: string; synopsis?: string; genre?: string; universeId?: string | null }
    ) {
        const existing = await prisma.project.findUnique({ where: { id: projectId } });
        if (!existing) throw new Error(`Project not found: ${projectId}`);

        const updateData: Record<string, string> = {};
        if (data.title !== undefined) updateData.title = data.title.trim();
        if (data.author !== undefined) updateData.author = data.author.trim();
        if (data.synopsis !== undefined) updateData.synopsis = data.synopsis.trim();
        if (data.genre !== undefined) updateData.genre = data.genre.trim();
        if (data.universeId !== undefined) (updateData as any).universeId = data.universeId;

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
            updatedAt: project.updatedAt.toISOString(),
        };
    }
}
