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
        completed: t.completed,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        scene: t.scene,
    };
}

export class WritingTaskController {
    static async listWritingTasks(params: {
        projectId: string;
        completed?: boolean;
        importance?: string;
        size?: string;
        energy?: string;
    }) {
        const { projectId, completed, importance, size, energy } = params;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });
        if (!project) throw new Error(`Project not found: ${projectId}`);

        const where: Record<string, unknown> = { projectId };
        if (completed !== undefined) where.completed = completed;
        if (importance) where.importance = importance;
        if (size) where.size = size;
        if (energy) where.energy = energy;

        const [tasks, total] = await Promise.all([
            prisma.writingTask.findMany({
                where,
                include: {
                    scene: { select: { id: true, title: true } },
                },
                orderBy: { createdAt: "desc" },
            }),
            prisma.writingTask.count({ where }),
        ]);

        return {
            tasks: tasks.map(serializeTask),
            total,
        };
    }

    static async createWritingTask(params: {
        projectId: string;
        sceneId?: string;
        name: string;
        whatIsNeeded?: string;
        importance?: string;
        size?: string;
        energy?: string;
    }) {
        const project = await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { id: true },
        });
        if (!project) throw new Error(`Project not found: ${params.projectId}`);

        const task = await prisma.writingTask.create({
            data: {
                projectId: params.projectId,
                name: params.name.trim(),
                sceneId: params.sceneId,
                whatIsNeeded: params.whatIsNeeded,
                importance: params.importance,
                size: params.size,
                energy: params.energy,
            },
            include: {
                scene: { select: { id: true, title: true } },
            },
        });

        return serializeTask(task);
    }

    static async completeWritingTask(taskId: string) {
        const existing = await prisma.writingTask.findUnique({
            where: { id: taskId },
            select: { id: true },
        });
        if (!existing) throw new Error(`Writing task not found: ${taskId}`);

        const task = await prisma.writingTask.update({
            where: { id: taskId },
            data: { completed: true },
            include: {
                scene: { select: { id: true, title: true } },
            },
        });

        return serializeTask(task);
    }

    static async updateWritingTask(
        taskId: string,
        data: {
            name?: string;
            whatIsNeeded?: string;
            importance?: string;
            size?: string;
            energy?: string;
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
