import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { registry, projectsGauge, usersGauge } from "@/lib/metrics";
import { logger } from "@/lib/logger";

// Middleware admits only the API_TOKEN bearer to this route; user sessions
// and MCP tokens are rejected before reaching this handler.
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
