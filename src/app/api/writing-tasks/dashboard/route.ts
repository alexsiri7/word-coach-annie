import { NextRequest, NextResponse } from "next/server";
import { TaskDashboardController } from "@/lib/controllers/task-dashboard";
import { WritingTaskCapacity, WritingTaskKind } from "@/schemas/writing-tasks";
import { getCurrentUserId } from "@/lib/api-auth";
import { isGoogleAuthMode } from "@/lib/auth";
import { logger } from "@/lib/logger";

// GET /api/writing-tasks/dashboard - the writer's tasks across every project, filtered by capacity
export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        if (isGoogleAuthMode() && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const searchParams = request.nextUrl.searchParams;
        const capacityParam = searchParams.get("capacity");
        const kindParam = searchParams.get("kind");

        const capacity = capacityParam === null ? undefined : WritingTaskCapacity.safeParse(capacityParam);
        if (capacity && !capacity.success) {
            return NextResponse.json({ error: capacity.error.issues[0].message }, { status: 400 });
        }
        const kind = kindParam === null ? undefined : WritingTaskKind.safeParse(kindParam);
        if (kind && !kind.success) {
            return NextResponse.json({ error: kind.error.issues[0].message }, { status: 400 });
        }

        const dashboard = await TaskDashboardController.getTaskDashboard({
            userId,
            capacity: capacity?.data,
            kind: kind?.data,
        });

        return NextResponse.json(dashboard);
    } catch (error) {
        logger.error("GET /api/writing-tasks/dashboard error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
