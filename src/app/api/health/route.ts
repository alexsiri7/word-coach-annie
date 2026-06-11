import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
    // Quick data integrity check — ensure core tables have data.
    // If all rows disappeared, something catastrophic happened (bad migration, etc.).
    try {
        const [projects, users] = await Promise.all([
            prisma.project.count(),
            prisma.user.count(),
        ]);

        const dataOk = projects > 0 || users > 0;

        return NextResponse.json(
            {
                status: dataOk ? "ok" : "degraded",
                ...(!dataOk && { warning: "Database appears empty — possible data loss" }),
            },
            { status: dataOk ? 200 : 503 }
        );
    } catch (e) {
        logger.error("Health check DB error", e);
        return NextResponse.json(
            { status: "error", error: "database unavailable" },
            { status: 503 }
        );
    }
}
