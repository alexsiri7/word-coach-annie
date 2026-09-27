import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type WritingTaskWithScene = Prisma.WritingTaskGetPayload<{
    include: { scene: { select: { id: true; title: true } } };
}>;

function serializeTask(t: WritingTaskWithScene) {
    return {
        id: t.id,
        projectId: t.projectId,
        sceneId: t.sceneId,
        name: t.name,
        whatIsNeeded: t.whatIsNeeded,
        importance: t.importance,
        size: t.size,
        energy: t.energy,
        kind: t.kind,
        capacity: t.capacity,
        dueDate: t.dueDate?.toISOString() ?? null,
        completed: t.completed,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        scene: t.scene,
    };
}

export class WritingTaskController {
    static async listWritingTasks(params: {
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
        const { projectId, userId, completed, importance, size, energy, kind, capacity, dueBefore } = params;

        let where: Prisma.WritingTaskWhereInput;
        if (projectId) {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
            });
            if (!project) throw new Error(`Project not found: ${projectId}`);
            where = { projectId };
        } else {
            where = { projectId: null, ...(userId ? { userId } : {}) };
        }
        if (completed !== undefined) where.completed = completed;
        if (importance) where.importance = importance;
        if (size) where.size = size;
        if (energy) where.energy = energy;
        if (kind) where.kind = kind;
        if (capacity) where.capacity = capacity;
        if (dueBefore) where.dueDate = { lte: new Date(dueBefore) };

        const rawTasks = await prisma.writingTask.findMany({
            where,
            include: {
                scene: { select: { id: true, title: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        const tasks = rawTasks.map(serializeTask);
        return { tasks, total: tasks.length };
    }

    static async createWritingTask(params: {
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
        if (params.sceneId && !params.projectId) throw new Error("sceneId requires projectId");

        let ownerId = params.userId;
        if (params.projectId) {
            const project = await prisma.project.findUnique({
                where: { id: params.projectId },
                select: { id: true, userId: true },
            });
            if (!project) throw new Error(`Project not found: ${params.projectId}`);
            ownerId = project.userId;
        }

        const task = await prisma.writingTask.create({
            data: {
                projectId: params.projectId ?? null,
                userId: ownerId,
                name: params.name.trim(),
                sceneId: params.sceneId,
                whatIsNeeded: params.whatIsNeeded,
                importance: params.importance,
                size: params.size,
                energy: params.energy,
                kind: params.kind,
                capacity: params.capacity,
                dueDate: params.dueDate ? new Date(params.dueDate) : undefined,
            },
            include: {
                scene: { select: { id: true, title: true } },
            },
        });

        return serializeTask(task);
    }

    static async completeWritingTask(taskId: string) {
        return WritingTaskController.updateWritingTask(taskId, { completed: true });
    }

    static async updateWritingTask(
        taskId: string,
        data: {
            name?: string;
            whatIsNeeded?: string;
            importance?: string;
            size?: string;
            energy?: string;
            kind?: string;
            capacity?: string;
            dueDate?: string | null;
            completed?: boolean;
        }
    ) {
        const existing = await prisma.writingTask.findUnique({
            where: { id: taskId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Writing task not found: ${taskId}`);

        const task = await prisma.writingTask.update({
            where: { id: taskId },
            data: {
                name: data.name?.trim(),
                whatIsNeeded: data.whatIsNeeded,
                importance: data.importance,
                size: data.size,
                energy: data.energy,
                kind: data.kind,
                capacity: data.capacity,
                dueDate: data.dueDate == null ? data.dueDate : new Date(data.dueDate),
                completed: data.completed,
            },
            include: {
                scene: { select: { id: true, title: true } },
            },
        });

        return serializeTask(task);
    }

    static async deleteWritingTask(taskId: string) {
        const existing = await prisma.writingTask.findUnique({
            where: { id: taskId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Writing task not found: ${taskId}`);

        await prisma.writingTask.delete({ where: { id: taskId } });

        return { success: true, id: taskId };
    }
}
