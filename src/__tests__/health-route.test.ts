import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
    prisma: {
        project: { count: vi.fn() },
        user: { count: vi.fn() },
    },
}));

describe("GET /api/health", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns status ok when data exists and does not expose counts", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
        (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);

        const { GET } = await import("../app/api/health/route");
        const res = await GET();
        const body = await res.json();

        expect(body.status).toBe("ok");
        expect(body.db).toBeUndefined();
        expect(body.projects).toBeUndefined();
        expect(body.users).toBeUndefined();
    });

    it("returns status degraded with warning when both tables are empty", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
        (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

        const { GET } = await import("../app/api/health/route");
        const res = await GET();
        const body = await res.json();

        expect(body.status).toBe("degraded");
        expect(body.warning).toBeDefined();
        expect(body.db).toBeUndefined();
    });

    it("returns 503 on DB error without leaking error details beyond message", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("Connection refused")
        );

        const { GET } = await import("../app/api/health/route");
        const res = await GET();
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.status).toBe("error");
    });
});
