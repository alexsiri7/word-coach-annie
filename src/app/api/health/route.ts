import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

type HealthStatus = "ok" | "degraded" | "error";

/** Anonymous callers can poll this freely, so the DB is queried at most once per window. */
const CACHE_MS = 10_000;
let cached: { at: number; status: Promise<HealthStatus> } | null = null;

// Quick data integrity check — ensure core tables have data.
// If all rows disappeared, something catastrophic happened (bad migration, etc.).
async function checkData(): Promise<HealthStatus> {
    try {
        const [projects, users] = await Promise.all([
            prisma.project.count(),
            prisma.user.count(),
        ]);
        return projects > 0 || users > 0 ? "ok" : "degraded";
    } catch (e) {
        logger.error("Health check DB error", e);
        return "error";
    }
}

export async function GET() {
    const now = Date.now();
    if (!cached || now - cached.at >= CACHE_MS) {
        cached = { at: now, status: checkData() };
    }
    const status = await cached.status;

    if (status === "error") {
        return NextResponse.json(
            { status, error: "database unavailable" },
            { status: 503 }
        );
    }
    return NextResponse.json({ status }, { status: status === "ok" ? 200 : 503 });
}
