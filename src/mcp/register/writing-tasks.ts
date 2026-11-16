import { mcpRun } from "@/mcp/tool-errors";
import { prisma } from "@/lib/db";
import {
    listWritingTasks,
    createWritingTask,
    completeWritingTask,
    updateWritingTask,
    getTaskDashboard,
} from "@/mcp/tools/writing-tasks";
import { AccessDeniedError, assertProjectOwner as verifyProjectOwnership } from "@/lib/ownership";
import {
    listWritingTasksSpec,
    getTaskDashboardSpec,
    createWritingTaskSpec,
    completeWritingTaskSpec,
    updateWritingTaskSpec,
} from "@/lib/ai/tool-catalog/writing-tasks";
import { registerTool, type RegisterContext } from "./register-tool";

/** Verify userId may modify a writing task — via its project, or its own owner when it has none. No-op in single-user mode. */
async function verifyWritingTaskAccess(taskId: string, uid: string | null): Promise<void> {
    const task = await prisma.writingTask.findUnique({
        where: { id: taskId },
        select: { projectId: true, userId: true },
    });
    if (!task) throw new AccessDeniedError("Writing task");
    if (task.projectId) return verifyProjectOwnership(task.projectId, uid);
    if (uid && task.userId !== uid) throw new AccessDeniedError("Writing task");
}

export function registerWritingTaskTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listWritingTasksSpec, async (params) =>
        mcpRun("list_writing_tasks", "Error listing writing tasks", async () => {
            if (params.projectId) await verifyProjectOwnership(params.projectId, userId);
            return listWritingTasks({ ...params, userId });
        }));

    registerTool(ctx, getTaskDashboardSpec, async (params) =>
        mcpRun("get_task_dashboard", "Error getting task dashboard", async () => {
            if (params.projectId) await verifyProjectOwnership(params.projectId, userId);
            return getTaskDashboard({ ...params, userId });
        }));

    registerTool(ctx, createWritingTaskSpec, async (params) =>
        mcpRun("create_writing_task", "Error creating writing task", async () => {
            if (params.projectId) await verifyProjectOwnership(params.projectId, userId);
            return createWritingTask({ ...params, userId });
        }));

    registerTool(ctx, completeWritingTaskSpec, async ({ taskId }) =>
        mcpRun("complete_writing_task", "Error completing writing task", async () => {
            await verifyWritingTaskAccess(taskId, userId);
            return completeWritingTask(taskId);
        }));

    registerTool(ctx, updateWritingTaskSpec, async (params) =>
        mcpRun("update_writing_task", "Error updating writing task", async () => {
            await verifyWritingTaskAccess(params.taskId, userId);
            return updateWritingTask(params);
        }));
}
