import { ProjectsController } from "@/lib/controllers/projects";

export async function listProjects(limit: number = 20, offset: number = 0) {
    return ProjectsController.listProjects(limit, offset);
}

export async function getProject(projectId: string) {
    return ProjectsController.getProject(projectId);
}

export async function createProject(params: {
    title: string;
    author?: string;
    synopsis?: string;
    genre?: string;
}) {
    return ProjectsController.createProject(params);
}

export async function updateProject(
    projectId: string,
    data: { title?: string; author?: string; synopsis?: string; genre?: string }
) {
    return ProjectsController.updateProject(projectId, data);
}
