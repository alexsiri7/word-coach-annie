import { WritingTaskController } from "@/lib/controllers/writing-tasks";
import { mcpCache } from "@/lib/cache";

function writingTasksKey(params: {
    projectId: string;
    completed?: boolean;
    importance?: string;
    size?: string;
    energy?: string;
}): string {
    return `writingTasks:${params.projectId}:${params.completed ?? ""}:${params.importance ?? ""}:${params.size ?? ""}:${params.energy ?? ""}`;
}

export async function listWritingTasks(params: {
    projectId: string;
    completed?: boolean;
    importance?: string;
    size?: string;
    energy?: string;
}) {
    return mcpCache.getOrSet(writingTasksKey(params), () => WritingTaskController.listWritingTasks(params));
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

export async function completeWritingTask(taskId: string) {
    const result = await WritingTaskController.completeWritingTask(taskId);
    mcpCache.invalidatePrefix("writingTasks:");
    return result;
}
