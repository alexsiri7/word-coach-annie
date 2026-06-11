import { ProjectsController } from "@/lib/controllers/projects";
import { mcpCache } from "@/lib/cache";
import { computeContentHash, verifyContentHash } from "@/mcp/content-hash";
import { prisma } from "@/lib/db";

function projectContentHash(p: {
    title: string;
    author?: string | null;
    synopsis?: string | null;
    genre?: string | null;
}): string {
    return computeContentHash(p.title, p.author, p.synopsis, p.genre);
}

export async function listProjects(userId: string | null, limit: number = 20, offset: number = 0) {
    return mcpCache.getOrSet(
        `projects:list:${userId}:${limit}:${offset}`,
        () => ProjectsController.listProjects(limit, offset, userId),
    );
}

export async function getProject(userId: string | null, projectId: string) {
    if (userId) {
        const project = await prisma.project.findFirst({
            where: { id: projectId, userId },
            select: { id: true },
        });
        if (!project) throw new Error("Project not found or access denied");
    }
    const raw = await mcpCache.getOrSet(
        `project:${userId}:${projectId}`,
        () => ProjectsController.getProject(projectId),
    );
    return {
        ...raw,
        contentHash: projectContentHash(raw),
    };
}

export async function createProject(params: {
    title: string;
    author?: string;
    synopsis?: string;
    genre?: string;
    userId?: string | null;
}) {
    const result = await ProjectsController.createProject(params);
    mcpCache.invalidatePrefix("projects:");
    return result;
}

export async function updateProject(
    userId: string | null,
    projectId: string,
    data: { title?: string; author?: string; synopsis?: string; genre?: string },
    contentHash?: string
) {
    if (userId) {
        const project = await prisma.project.findFirst({
            where: { id: projectId, userId },
            select: { id: true },
        });
        if (!project) throw new Error("Project not found or access denied");
    }
    if (contentHash !== undefined) {
        const current = await ProjectsController.getProject(projectId);
        verifyContentHash(contentHash, projectContentHash(current), "get_project");
    }
    const result = await ProjectsController.updateProject(projectId, data);
    mcpCache.invalidatePrefix("projects:");
    mcpCache.delete(`project:${userId}:${projectId}`);
    mcpCache.invalidatePrefix(`projectSummary:`);
    return result;
}
