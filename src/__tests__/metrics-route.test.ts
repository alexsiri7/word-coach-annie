import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
    prisma: {
        project: { count: vi.fn() },
        user: { count: vi.fn() },
    },
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setUser: vi.fn(),
}));

vi.mock("@/lib/metrics", () => {
    const projectsSet = vi.fn();
    const usersSet = vi.fn();
    const registry = {
        metrics: vi.fn().mockResolvedValue(
            "# HELP annie_projects_total Total projects in the database\n# TYPE annie_projects_total gauge\nannie_projects_total 5\n# HELP annie_users_total Total users in the database\n# TYPE annie_users_total gauge\nannie_users_total 10\n"
        ),
        contentType: "text/plain; version=0.0.4; charset=utf-8",
    };
    return { registry, projectsGauge: { set: projectsSet }, usersGauge: { set: usersSet } };
});

import { projectsGauge, usersGauge } from "@/lib/metrics";
import { GET } from "../app/api/metrics/route";

describe("GET /api/metrics", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 200 with Prometheus text on success", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
        (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);

        const res = await GET();
        expect(res.status).toBe(200);

        const body = await res.text();
        expect(body).toContain("annie_projects_total");
        expect(body).toContain("annie_users_total");
    });

    it("sets project and user gauge values", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockResolvedValue(42);
        (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(7);

        await GET();

        expect(projectsGauge.set).toHaveBeenCalledWith(42);
        expect(usersGauge.set).toHaveBeenCalledWith(7);
    });

    it("returns correct Content-Type header", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
        (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

        const res = await GET();
        expect(res.headers.get("Content-Type")).toContain("text/plain");
    });

    it("returns 503 on DB error", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("Connection refused")
        );

        const res = await GET();
        expect(res.status).toBe(503);
    });
});
