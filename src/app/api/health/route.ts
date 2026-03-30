import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
    // Quick data integrity check — ensure core tables have data.
    // If all rows disappeared, something catastrophic happened (bad migration, etc.).
    try {
        const [projects, users] = await Promise.all([
            prisma.project.count(),
            prisma.user.count(),
        ]);

        const dataOk = projects > 0 || users > 0;

        return NextResponse.json({
            status: dataOk ? "ok" : "degraded",
            db: { projects, users },
            ...(!dataOk && { warning: "Database appears empty — possible data loss" }),
        });
    } catch (e) {
        return NextResponse.json(
            { status: "error", error: e instanceof Error ? e.message : "DB unreachable" },
            { status: 503 }
        );
    }
}
