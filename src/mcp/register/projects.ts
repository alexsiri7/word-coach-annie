import { mcpRun } from "@/mcp/tool-errors";
import { listProjects, getProject, createProject, updateProject } from "@/mcp/tools/projects";
import { listProjectsSpec, getProjectSpec, createProjectSpec, updateProjectSpec } from "@/lib/ai/tool-catalog/projects";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerProjectTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listProjectsSpec, async ({ limit, offset }) => {
        const result = await listProjects(userId, limit, offset);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, getProjectSpec, async ({ projectId }) => {
        const result = await getProject(userId, projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, createProjectSpec, async (params) => {
        const result = await createProject({ ...params, userId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, updateProjectSpec, async ({ projectId, contentHash, title, author, synopsis, genre }) =>
        mcpRun("update_project", "Error updating project", () =>
            updateProject(userId, projectId, { title, author, synopsis, genre }, contentHash)));
}
