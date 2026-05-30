import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { registry, projectsGauge, usersGauge } from "@/lib/metrics";
import { logger } from "@/lib/logger";

// Auth is enforced by middleware; no route-level guard needed.
// Removing /api/metrics from PUBLIC_PATHS in middleware.ts ensures
// unauthenticated requests (including API_TOKEN bearer sessions) are
// handled uniformly by the middleware before reaching this handler.
export async function GET(_request: NextRequest) {
    try {
        const [projects, users] = await Promise.all([
            prisma.project.count(),
            prisma.user.count(),
        ]);

        projectsGauge.set(projects);
        usersGauge.set(users);

        const text = await registry.metrics();
        return new Response(text, {
            headers: { "Content-Type": registry.contentType },
        });
    } catch (e) {
        logger.error("metrics scrape failed", e);
        return new Response("Service unavailable", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
        });
    }
}
