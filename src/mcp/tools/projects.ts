import { ProjectsController } from "@/lib/controllers/projects";
import { mcpCache } from "@/lib/cache";
import { computeContentHash, verifyContentHash } from "@/mcp/content-hash";

function projectContentHash(p: {
    title: string;
    author?: string | null;
    synopsis?: string | null;
    genre?: string | null;
}): string {
    return computeContentHash(p.title, p.author, p.synopsis, p.genre);
}

export async function listProjects(limit: number = 20, offset: number = 0) {
    return mcpCache.getOrSet(
        `projects:list:${limit}:${offset}`,
        () => ProjectsController.listProjects(limit, offset),
    );
}

export async function getProject(projectId: string) {
    const raw = await mcpCache.getOrSet(
        `project:${projectId}`,
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
    projectId: string,
    data: { title?: string; author?: string; synopsis?: string; genre?: string },
    contentHash?: string
) {
    if (contentHash !== undefined) {
        const current = await ProjectsController.getProject(projectId);
        verifyContentHash(contentHash, projectContentHash(current), "get_project");
    }
    const result = await ProjectsController.updateProject(projectId, data);
    mcpCache.invalidatePrefix("projects:");
    mcpCache.delete(`project:${projectId}`);
    mcpCache.invalidatePrefix(`projectSummary:`);
    return result;
}
