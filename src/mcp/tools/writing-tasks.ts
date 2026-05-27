import { WritingTaskController } from "@/lib/controllers/writing-tasks";
import { mcpCache } from "@/lib/cache";

export async function listWritingTasks(params: {
    projectId: string;
    completed?: boolean;
    importance?: string;
    size?: string;
    energy?: string;
}) {
    const key = `writingTasks:${params.projectId}:${params.completed ?? ""}:${params.importance ?? ""}:${params.size ?? ""}:${params.energy ?? ""}`;
    return mcpCache.getOrSet(key, () => WritingTaskController.listWritingTasks(params));
}

export async function createWritingTask(params: {
    projectId: string;
    sceneId?: string;
    name: string;
    whatIsNeeded?: string;
    importance?: string;
    size?: string;
    energy?: string;
}) {
    const result = await WritingTaskController.createWritingTask(params);
    mcpCache.invalidatePrefix(`writingTasks:${params.projectId}:`);
    return result;
}

export async function updateWritingTask(params: {
    taskId: string;
    name?: string;
    whatIsNeeded?: string;
    importance?: string;
    size?: string;
    energy?: string;
    completed?: boolean;
}) {
    const { taskId, ...data } = params;
    if (Object.keys(data).length === 0) {
        throw new Error("No fields provided to update — at least one optional field must be supplied.");
    }
    const result = await WritingTaskController.updateWritingTask(taskId, data);
    mcpCache.invalidatePrefix(`writingTasks:${result.projectId}:`);
    return result;
}

export async function completeWritingTask(taskId: string) {
    const result = await WritingTaskController.completeWritingTask(taskId);
    mcpCache.invalidatePrefix(`writingTasks:${result.projectId}:`);
    return result;
}
