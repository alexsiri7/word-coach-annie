import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "../app/api/health/route";

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

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe("ok");
        expect(body.db).toBeUndefined();
        expect(body.projects).toBeUndefined();
        expect(body.users).toBeUndefined();
    });

    it("returns status degraded with warning when both tables are empty", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
        (prisma.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(503);
        expect(body.status).toBe("degraded");
        expect(body.warning).toBeDefined();
        expect(body.db).toBeUndefined();
    });

    it("returns 503 on DB error with generic message, not raw error details", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error("Connection refused")
        );

        const res = await GET();
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.status).toBe("error");
        expect(body.error).toBe("database unavailable");
        expect(JSON.stringify(body)).not.toContain("Connection refused"); // security: no leak anywhere in response
        expect(body.db).toBeUndefined();
        expect(body.stack).toBeUndefined();
    });

    it("returns 503 with generic message when a non-Error value is thrown", async () => {
        (prisma.project.count as ReturnType<typeof vi.fn>).mockRejectedValue("timeout");

        const res = await GET();
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.status).toBe("error");
        expect(body.error).toBe("database unavailable");
    });
});
