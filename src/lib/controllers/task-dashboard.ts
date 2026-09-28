import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { fitsCapacity, pickSuggestedTasks, rankTasks } from "@/lib/writing-task-ranking";
import {
    WritingTaskCapacity,
    WritingTaskEnergy,
    WritingTaskImportance,
    WritingTaskKind,
    WritingTaskSize,
    type WritingTaskCapacityValue,
    type WritingTaskKindValue,
} from "@/schemas/writing-tasks";

export const OPEN_TASK_LIMIT = 50;
export const UPCOMING_DEADLINE_LIMIT = 10;
const COMPLETED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const dashboardTaskInclude = {
    project: { select: { id: true, title: true } },
    scene: { select: { id: true, title: true } },
} satisfies Prisma.WritingTaskInclude;

type DashboardTaskRow = Prisma.WritingTaskGetPayload<{ include: typeof dashboardTaskInclude }>;

function toDashboardTask(t: DashboardTaskRow) {
    return {
        id: t.id,
        name: t.name,
        whatIsNeeded: t.whatIsNeeded,
        kind: WritingTaskKind.parse(t.kind),
        capacity: WritingTaskCapacity.parse(t.capacity),
        importance: WritingTaskImportance.parse(t.importance),
        size: WritingTaskSize.parse(t.size),
        energy: WritingTaskEnergy.parse(t.energy),
        dueDate: t.dueDate?.toISOString() ?? null,
        deadline: t.dueDate,
        project: t.project,
        scene: t.scene,
    };
}

type DashboardTask = ReturnType<typeof toDashboardTask>;

function withoutDeadline({ deadline: _deadline, ...task }: DashboardTask) {
    return task;
}

type UpcomingDeadline =
    | { type: "task"; id: string; title: string; date: Date; project: DashboardTask["project"] }
    | { type: "opportunity"; id: string; title: string; date: Date; status: string };

function startOfTodayUtc(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class TaskDashboardController {
    static async getTaskDashboard(params: {
        userId: string | null;
        capacity?: WritingTaskCapacityValue;
        kind?: WritingTaskKindValue;
        projectId?: string;
    }) {
        const { userId, capacity, kind, projectId } = params;
        const now = new Date();

        const taskWhere: Prisma.WritingTaskWhereInput = userId ? { userId } : {};
        if (projectId) taskWhere.projectId = projectId;
        if (kind) taskWhere.kind = kind;
        if (capacity) {
            taskWhere.capacity = { in: WritingTaskCapacity.options.filter((c) => fitsCapacity(c, capacity)) };
        }

        const opportunityWhere: Prisma.OpportunityWhereInput = {
            ...(userId ? { userId } : {}),
            status: { not: "closed" },
            // Close dates are often date-only (midnight UTC), so one closing today is still open.
            closeDate: { gte: startOfTodayUtc(now) },
        };
        // Mirrors OpportunityController.listOpportunities: an opportunity belongs to a project
        // only through a candidate entry.
        if (projectId) opportunityWhere.candidates = { some: { projectId } };

        const [openRows, completedRows, opportunities] = await Promise.all([
            prisma.writingTask.findMany({
                where: { ...taskWhere, completed: false },
                include: dashboardTaskInclude,
            }),
            // There is no completedAt column; completing a task is its last write, so
            // updatedAt stands in for the completion time.
            prisma.writingTask.findMany({
                where: { ...taskWhere, completed: true, updatedAt: { gte: new Date(now.getTime() - COMPLETED_WINDOW_MS) } },
                include: dashboardTaskInclude,
                orderBy: { updatedAt: "desc" },
            }),
            prisma.opportunity.findMany({
                where: opportunityWhere,
                select: { id: true, title: true, closeDate: true, status: true },
                orderBy: { closeDate: "asc" },
                take: UPCOMING_DEADLINE_LIMIT,
            }),
        ]);

        const openTasks = rankTasks(openRows.map(toDashboardTask));

        const upcomingDeadlines: UpcomingDeadline[] = [
            ...openTasks.flatMap((t) =>
                t.deadline ? [{ type: "task" as const, id: t.id, title: t.name, date: t.deadline, project: t.project }] : []
            ),
            ...opportunities.map((o) => ({
                type: "opportunity" as const,
                id: o.id,
                title: o.title,
                date: o.closeDate,
                status: o.status,
            })),
        ];
        upcomingDeadlines.sort((a, b) => a.date.getTime() - b.date.getTime());

        return {
            suggestedNow: pickSuggestedTasks(openTasks, capacity ?? "Full").map(withoutDeadline),
            upcomingDeadlines: upcomingDeadlines
                .slice(0, UPCOMING_DEADLINE_LIMIT)
                .map((d) => ({ ...d, date: d.date.toISOString() })),
            openTasks: openTasks.slice(0, OPEN_TASK_LIMIT).map(withoutDeadline),
            openTaskTotal: openTasks.length,
            completedThisWeek: completedRows.map((t) => ({
                id: t.id,
                name: t.name,
                kind: t.kind,
                project: t.project,
                completedAt: t.updatedAt.toISOString(),
            })),
        };
    }
}
