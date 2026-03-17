import { ProjectsController } from "@/lib/controllers/projects";
import { mcpCache } from "@/lib/cache";

export async function listProjects(limit: number = 20, offset: number = 0) {
    return mcpCache.getOrSet(
        `projects:list:${limit}:${offset}`,
        () => ProjectsController.listProjects(limit, offset),
    );
}

export async function getProject(projectId: string) {
    return mcpCache.getOrSet(
        `project:${projectId}`,
        () => ProjectsController.getProject(projectId),
    );
}

export async function createProject(params: {
    title: string;
    author?: string;
    synopsis?: string;
    genre?: string;
}) {
    const result = await ProjectsController.createProject(params);
    mcpCache.invalidatePrefix("projects:");
    return result;
}

export async function updateProject(
    projectId: string,
    data: { title?: string; author?: string; synopsis?: string; genre?: string }
) {
    const result = await ProjectsController.updateProject(projectId, data);
    mcpCache.invalidatePrefix("projects:");
    mcpCache.delete(`project:${projectId}`);
    mcpCache.invalidatePrefix(`projectSummary:`);
    return result;
}
