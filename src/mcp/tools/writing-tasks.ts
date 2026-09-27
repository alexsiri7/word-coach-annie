import { WritingTaskController } from "@/lib/controllers/writing-tasks";
import { mcpCache } from "@/lib/cache";

// Writes invalidate every writingTasks: entry — practice-task lists are keyed by user, not project.
const WRITING_TASKS_PREFIX = "writingTasks:";

export async function listWritingTasks(params: {
    projectId?: string;
    userId: string | null;
    completed?: boolean;
    importance?: string;
    size?: string;
    energy?: string;
    kind?: string;
    capacity?: string;
    dueBefore?: string;
}) {
    const scope = params.projectId ?? `practice:${params.userId ?? ""}`;
    const key = `${WRITING_TASKS_PREFIX}${scope}:${params.completed ?? ""}:${params.importance ?? ""}:${params.size ?? ""}:${params.energy ?? ""}:${params.kind ?? ""}:${params.capacity ?? ""}:${params.dueBefore ?? ""}`;
    return mcpCache.getOrSet(key, () => WritingTaskController.listWritingTasks(params));
}

export async function createWritingTask(params: {
    projectId?: string;
    userId: string | null;
    sceneId?: string;
    name: string;
    whatIsNeeded?: string;
    importance?: string;
    size?: string;
    energy?: string;
    kind?: string;
    capacity?: string;
    dueDate?: string;
}) {
    const result = await WritingTaskController.createWritingTask(params);
    mcpCache.invalidatePrefix(WRITING_TASKS_PREFIX);
    return result;
}

export async function updateWritingTask(params: {
    taskId: string;
    name?: string;
    whatIsNeeded?: string;
    importance?: string;
    size?: string;
    energy?: string;
    kind?: string;
    capacity?: string;
    dueDate?: string | null;
    completed?: boolean;
}) {
    const { taskId, ...data } = params;
    if (Object.keys(data).length === 0) {
        throw new Error("No fields provided to update — at least one optional field must be supplied.");
    }
    const result = await WritingTaskController.updateWritingTask(taskId, data);
    mcpCache.invalidatePrefix(WRITING_TASKS_PREFIX);
    return result;
}

export async function completeWritingTask(taskId: string) {
    const result = await WritingTaskController.completeWritingTask(taskId);
    mcpCache.invalidatePrefix(WRITING_TASKS_PREFIX);
    return result;
}
