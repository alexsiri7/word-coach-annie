import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn(() => null as string | null),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/auth", async () => ({
    ...(await vi.importActual("@/lib/auth")),
    isGoogleAuthMode: vi.fn(() => false),
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { isGoogleAuthMode } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function get(query = "") {
    const { GET } = await import("@/app/api/writing-tasks/dashboard/route");
    return GET(new NextRequest(`http://localhost/api/writing-tasks/dashboard${query}`));
}

describe("GET /api/writing-tasks/dashboard", () => {
    const userId = "dashboard-user";

    beforeEach(async () => {
        vi.clearAllMocks();
        await prisma.user.create({ data: { id: userId, email: "dashboard@test.com", googleId: "google-dashboard" } });
        await prisma.user.create({ data: { id: "other-user", email: "other@test.com", googleId: "google-other" } });
        const project = await prisma.project.create({ data: { title: "The Amber Throne", author: "A", userId } });
        await prisma.writingTask.createMany({
            data: [
                { userId, name: "Practice freewrite", capacity: "Low" },
                { userId, projectId: project.id, name: "Draft chapter 3", capacity: "Full" },
                { userId: "other-user", name: "Someone else's task", capacity: "Low" },
            ],
        });
        vi.mocked(getCurrentUserId).mockReturnValue(userId);
        vi.mocked(isGoogleAuthMode).mockReturnValue(false);
    });

    it("rejects an unidentified caller when Google auth is on", async () => {
        vi.mocked(getCurrentUserId).mockReturnValue(null);
        vi.mocked(isGoogleAuthMode).mockReturnValue(true);
        expect((await get()).status).toBe(401);
    });

    it.each(["?capacity=Huge", "?kind=Daydream"])("returns 400 for %s", async (query) => {
        expect((await get(query)).status).toBe(400);
    });

    it("filters every task section by the requested capacity", async () => {
        const body = await (await get("?capacity=Low")).json();
        expect(body.openTasks.map((t: { name: string }) => t.name)).toEqual(["Practice freewrite"]);
        expect(body.suggestedNow.map((t: { name: string }) => t.name)).toEqual(["Practice freewrite"]);
        expect(body.openTasks[0].project).toBeNull();
    });

    it("returns only the caller's tasks across projects and practice", async () => {
        const res = await get();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.openTasks.map((t: { name: string }) => t.name).sort()).toEqual(["Draft chapter 3", "Practice freewrite"]);
        expect(body.openTaskTotal).toBe(2);
    });
});
