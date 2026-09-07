import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn(() => null as string | null),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { ProjectsController } from "@/lib/controllers/projects";

const CLOSE_DATE = "2030-04-01T00:00:00.000Z";

function jsonRequest(method: string, body?: unknown): NextRequest {
    return new NextRequest("http://localhost/api/opportunities", {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

describe("Opportunity API routes", () => {
    let userId: string;
    let providerId: string;
    let projectId: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        const user = await prisma.user.create({
            data: { id: "opp-route-user", email: "opp-route@test.com", googleId: "google-opp-route" },
        });
        userId = user.id;
        const provider = await prisma.provider.create({ data: { userId, name: "Contest Org" } });
        providerId = provider.id;
        const project = await ProjectsController.createProject({ title: "Test Project", userId });
        projectId = project.id;
        vi.mocked(getCurrentUserId).mockReturnValue(userId);
    });

    async function createOpportunityViaApi(body: Record<string, unknown> = {}) {
        const { POST } = await import("@/app/api/opportunities/route");
        return POST(jsonRequest("POST", { providerId, title: "Spring Prize", closeDate: CLOSE_DATE, ...body }));
    }

    it("creates an opportunity and lists it", async () => {
        const created = await createOpportunityViaApi();
        expect(created.status).toBe(201);

        const { GET } = await import("@/app/api/opportunities/route");
        const res = await GET(jsonRequest("GET"));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ total: 1 });
    });

    it("returns 401 when unauthenticated", async () => {
        vi.mocked(getCurrentUserId).mockReturnValue(null);
        const { GET } = await import("@/app/api/opportunities/route");
        expect((await GET(jsonRequest("GET"))).status).toBe(401);
    });

    it("returns 400 when closeDate is not ISO 8601", async () => {
        const res = await createOpportunityViaApi({ closeDate: "next spring" });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("closeDate");
    });

    it("strips markup from free-text fields", async () => {
        const res = await createOpportunityViaApi({
            title: "<script>alert(1)</script>Spring Prize",
            eligibilityNotes: "<b>UK</b> residents",
        });
        const body = await res.json();

        expect(body.title).toBe("Spring Prize");
        expect(body.eligibilityNotes).toBe("UK residents");
    });

    it("returns 403 when the provider belongs to another user", async () => {
        const other = await prisma.user.create({
            data: { id: "opp-route-other", email: "opp-other@test.com", googleId: "google-opp-other" },
        });
        const otherProvider = await prisma.provider.create({ data: { userId: other.id, name: "Their Org" } });

        const res = await createOpportunityViaApi({ providerId: otherProvider.id });
        expect(res.status).toBe(403);
    });

    it("returns 404 when patching an opportunity that does not exist", async () => {
        const { PATCH } = await import("@/app/api/opportunities/[id]/route");
        const res = await PATCH(jsonRequest("PATCH", { status: "closed" }), {
            params: Promise.resolve({ id: "missing" }),
        });
        expect(res.status).toBe(404);
    });

    it("returns 400 when a patch carries no fields", async () => {
        const created = await (await createOpportunityViaApi()).json();
        const { PATCH } = await import("@/app/api/opportunities/[id]/route");
        const res = await PATCH(jsonRequest("PATCH", {}), { params: Promise.resolve({ id: created.id }) });
        expect(res.status).toBe(400);
    });

    it("patches and deletes an opportunity", async () => {
        const created = await (await createOpportunityViaApi()).json();
        const { PATCH, DELETE } = await import("@/app/api/opportunities/[id]/route");
        const params = { params: Promise.resolve({ id: created.id }) };

        const patched = await PATCH(jsonRequest("PATCH", { status: "considering" }), params);
        expect((await patched.json()).status).toBe("considering");

        expect((await DELETE(jsonRequest("DELETE"), params)).status).toBe(200);
        expect(await prisma.opportunity.findUnique({ where: { id: created.id } })).toBeNull();
    });

    it("adds a candidate and promotes it once chosen", async () => {
        const opportunity = await (await createOpportunityViaApi()).json();
        const opportunityParams = { params: Promise.resolve({ id: opportunity.id }) };

        const { POST: postCandidate } = await import("@/app/api/opportunities/[id]/candidates/route");
        const created = await postCandidate(jsonRequest("POST", { projectId }), opportunityParams);
        expect(created.status).toBe(201);
        const candidate = await created.json();

        const { POST: promote } = await import(
            "@/app/api/opportunities/[id]/candidates/[candidateId]/promote/route"
        );
        const candidateParams = { params: Promise.resolve({ candidateId: candidate.id }) };

        const tooEarly = await promote(jsonRequest("POST"), candidateParams);
        expect(tooEarly.status).toBe(409);

        const { PATCH: patchCandidate } = await import(
            "@/app/api/opportunities/[id]/candidates/[candidateId]/route"
        );
        await patchCandidate(jsonRequest("PATCH", { state: "chosen" }), candidateParams);

        const promoted = await promote(jsonRequest("POST"), candidateParams);
        expect(promoted.status).toBe(201);
        expect((await promoted.json()).submission).toMatchObject({ projectId, contestName: "Spring Prize" });
    });

    it("returns 403 when attaching a project owned by another user", async () => {
        const opportunity = await (await createOpportunityViaApi()).json();
        const other = await prisma.user.create({
            data: { id: "opp-route-other-2", email: "opp-other-2@test.com", googleId: "google-opp-other-2" },
        });
        const otherProject = await ProjectsController.createProject({ title: "Their Novel", userId: other.id });

        const { POST } = await import("@/app/api/opportunities/[id]/candidates/route");
        const res = await POST(jsonRequest("POST", { projectId: otherProject.id }), {
            params: Promise.resolve({ id: opportunity.id }),
        });
        expect(res.status).toBe(403);
    });
});
