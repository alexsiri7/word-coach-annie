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
import { ProjectsController } from "@/lib/controllers/projects";
import { deriveOpportunityState, type Opportunity } from "@/lib/opportunity-state";

const CLOSE_DATE = "2030-04-01T00:00:00.000Z";

function jsonRequest(method: string, body?: unknown): NextRequest {
    return new NextRequest("http://localhost/api/opportunities", {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

function listRequest(query: string): NextRequest {
    return new NextRequest(`http://localhost/api/opportunities?${query}`);
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
        vi.mocked(isGoogleAuthMode).mockReturnValue(false);
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

    it("carries each candidate's story and submission so a row can name them", async () => {
        const opportunity = await (await createOpportunityViaApi()).json();
        const { POST: postCandidate } = await import("@/app/api/opportunities/[id]/candidates/route");
        await postCandidate(jsonRequest("POST", { projectId }), { params: Promise.resolve({ id: opportunity.id }) });

        const { GET } = await import("@/app/api/opportunities/route");
        const body = await (await GET(jsonRequest("GET"))).json();

        expect(body.opportunities[0]).toMatchObject({
            provider: { id: providerId, name: "Contest Org" },
            candidates: [{ projectId, project: { id: projectId, title: "Test Project" }, submission: null }],
        });
    });

    describe("list filters", () => {
        async function seed() {
            const otherProvider = await prisma.provider.create({ data: { userId, name: "Second Org" } });
            const shortlisted = await (await createOpportunityViaApi({ title: "Shortlisted Prize" })).json();
            await (await createOpportunityViaApi({ title: "Considered Prize", status: "considering" })).json();
            const elsewhere = await (
                await createOpportunityViaApi({ title: "Other Org Prize", providerId: otherProvider.id })
            ).json();

            const { POST: postCandidate } = await import("@/app/api/opportunities/[id]/candidates/route");
            await postCandidate(jsonRequest("POST", { projectId }), {
                params: Promise.resolve({ id: shortlisted.id }),
            });

            return { otherProvider, shortlisted, elsewhere };
        }

        async function listTitles(query: string): Promise<string[]> {
            const { GET } = await import("@/app/api/opportunities/route");
            const res = await GET(listRequest(query));
            expect(res.status).toBe(200);
            return (await res.json()).opportunities.map((o: { title: string }) => o.title);
        }

        it("filters by status", async () => {
            await seed();
            expect(await listTitles("status=considering")).toEqual(["Considered Prize"]);
        });

        it("filters by provider", async () => {
            const { otherProvider } = await seed();
            expect(await listTitles(`providerId=${otherProvider.id}`)).toEqual(["Other Org Prize"]);
        });

        it("filters by the story that is up for the contest", async () => {
            await seed();
            expect(await listTitles(`projectId=${projectId}`)).toEqual(["Shortlisted Prize"]);
        });

        it("rejects a status that is not one an opportunity can have", async () => {
            const { GET } = await import("@/app/api/opportunities/route");
            expect((await GET(listRequest("status=submitted"))).status).toBe(400);
        });
    });

    describe("contest submissions with no opportunity behind them", () => {
        const SUBMITTED_ON = "2026-01-20T10:00:00.000Z";

        async function seedSubmission(overrides: Record<string, unknown> = {}) {
            return prisma.contestSubmission.create({
                data: {
                    projectId,
                    providerId,
                    contestName: "Estuary Prize",
                    submissionDate: new Date(SUBMITTED_ON),
                    ...overrides,
                },
            });
        }

        async function list(query = "") {
            const { GET } = await import("@/app/api/opportunities/route");
            const res = await GET(listRequest(query));
            expect(res.status).toBe(200);
            return res.json();
        }

        async function listUnlinkedNames(query = ""): Promise<string[]> {
            const { unlinkedSubmissions } = await list(query);
            return unlinkedSubmissions.map((u: { contestName: string }) => u.contestName);
        }

        it("lists one beside the opportunities, with the detail its row needs", async () => {
            const submission = await seedSubmission();
            await createOpportunityViaApi();

            const body = await list();

            expect(body.unlinkedSubmissions).toEqual([
                {
                    id: submission.id,
                    projectId,
                    providerId,
                    contestName: "Estuary Prize",
                    submissionDate: SUBMITTED_ON,
                    status: "submitted",
                    provider: { id: providerId, name: "Contest Org" },
                    project: { id: projectId, title: "Test Project" },
                },
            ]);
            expect(body.total).toBe(2);
        });

        it("leaves out a submission a candidate already links", async () => {
            const opportunity = await (await createOpportunityViaApi()).json();
            const opportunityParams = { params: Promise.resolve({ id: opportunity.id }) };
            const { POST: postCandidate } = await import("@/app/api/opportunities/[id]/candidates/route");
            const candidate = await (await postCandidate(jsonRequest("POST", { projectId }), opportunityParams)).json();

            const { PATCH: patchCandidate } = await import(
                "@/app/api/opportunities/[id]/candidates/[candidateId]/route"
            );
            const candidateParams = { params: Promise.resolve({ id: opportunity.id, candidateId: candidate.id }) };
            await patchCandidate(jsonRequest("PATCH", { state: "chosen" }), candidateParams);

            const { POST: promote } = await import(
                "@/app/api/opportunities/[id]/candidates/[candidateId]/promote/route"
            );
            expect((await promote(jsonRequest("POST"), candidateParams)).status).toBe(201);

            expect((await list()).unlinkedSubmissions).toEqual([]);
        });

        it("leaves out another author's submission and one on a story put away", async () => {
            const other = await prisma.user.create({
                data: { id: "opp-route-unlinked", email: "opp-unlinked@test.com", googleId: "google-opp-unlinked" },
            });
            const theirProvider = await prisma.provider.create({ data: { userId: other.id, name: "Their Org" } });
            const theirProject = await ProjectsController.createProject({ title: "Their Novel", userId: other.id });
            await seedSubmission({
                projectId: theirProject.id,
                providerId: theirProvider.id,
                contestName: "Their Prize",
            });

            const archived = await ProjectsController.createProject({ title: "Shelved", userId });
            await prisma.project.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
            await seedSubmission({ projectId: archived.id, contestName: "Shelved Prize" });

            const mine = await seedSubmission();

            expect((await list()).unlinkedSubmissions.map((u: { id: string }) => u.id)).toEqual([mine.id]);
        });

        it("narrows by provider and by story the same way opportunities do", async () => {
            const otherProvider = await prisma.provider.create({ data: { userId, name: "Second Org" } });
            const otherProject = await ProjectsController.createProject({ title: "Second Story", userId });
            await seedSubmission();
            await seedSubmission({
                projectId: otherProject.id,
                contestName: "Same Org, Other Story",
                submissionDate: new Date("2026-01-19T10:00:00.000Z"),
            });
            await seedSubmission({
                providerId: otherProvider.id,
                contestName: "Other Org, Same Story",
                submissionDate: new Date("2026-01-18T10:00:00.000Z"),
            });

            expect(await listUnlinkedNames(`providerId=${providerId}`)).toEqual([
                "Estuary Prize",
                "Same Org, Other Story",
            ]);
            expect(await listUnlinkedNames(`projectId=${projectId}`)).toEqual([
                "Estuary Prize",
                "Other Org, Same Story",
            ]);
        });

        it("drops out of a status filter, having no opportunity status to match", async () => {
            await seedSubmission();

            const body = await list("status=found");
            expect(body.unlinkedSubmissions).toEqual([]);
            expect(body.total).toBe(0);
        });

        it("backfilling details links the submission that exists instead of entering it again", async () => {
            const submission = await seedSubmission();

            const res = await createOpportunityViaApi({ submissionId: submission.id });
            expect(res.status).toBe(201);
            const opportunity = await res.json();

            expect(await prisma.contestSubmission.count()).toBe(1);

            const { GET: getOne } = await import("@/app/api/opportunities/[id]/route");
            const detail = await (
                await getOne(jsonRequest("GET"), { params: Promise.resolve({ id: opportunity.id }) })
            ).json();
            expect(detail.candidates).toMatchObject([
                { state: "chosen", projectId, submission: { id: submission.id, status: "submitted" } },
            ]);

            expect((await list()).unlinkedSubmissions).toEqual([]);
        });

        it("reads as entered rather than as a deadline that was missed", async () => {
            const PASSED = "2026-01-25T00:00:00.000Z";
            const now = new Date("2026-06-01T12:00:00.000Z");
            const submission = await seedSubmission();
            await createOpportunityViaApi({
                title: "Backfilled Prize",
                closeDate: PASSED,
                submissionId: submission.id,
            });
            await createOpportunityViaApi({ title: "Untouched Prize", closeDate: PASSED });

            const { opportunities } = await list();
            const byTitle = Object.fromEntries(
                (opportunities as Opportunity[]).map((o) => [o.title, deriveOpportunityState(o, now)])
            );

            expect(byTitle["Backfilled Prize"]).toMatchObject({ kind: "submitted", label: "Submitted" });
            expect(byTitle["Untouched Prize"]).toMatchObject({ kind: "missed", label: "Closed, nothing entered" });
        });

        it("refuses a backfill for a submission that is missing, another author's, or already linked", async () => {
            expect((await createOpportunityViaApi({ submissionId: "missing" })).status).toBe(404);

            const other = await prisma.user.create({
                data: { id: "opp-route-backfill", email: "opp-backfill@test.com", googleId: "google-opp-backfill" },
            });
            const theirProvider = await prisma.provider.create({ data: { userId: other.id, name: "Their Org" } });
            const theirProject = await ProjectsController.createProject({ title: "Their Novel", userId: other.id });
            const theirs = await seedSubmission({ projectId: theirProject.id, providerId: theirProvider.id });
            expect((await createOpportunityViaApi({ submissionId: theirs.id })).status).toBe(403);

            const mine = await seedSubmission();
            expect((await createOpportunityViaApi({ submissionId: mine.id })).status).toBe(201);
            expect((await createOpportunityViaApi({ submissionId: mine.id })).status).toBe(409);
        });
    });

    it("returns 401 when Google auth is on and the caller is unauthenticated", async () => {
        vi.mocked(getCurrentUserId).mockReturnValue(null);
        vi.mocked(isGoogleAuthMode).mockReturnValue(true);
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

    describe("fetching one opportunity", () => {
        async function getOpportunity(id: string) {
            const { GET } = await import("@/app/api/opportunities/[id]/route");
            return GET(jsonRequest("GET"), { params: Promise.resolve({ id }) });
        }

        it("returns the contest with its provider and candidate detail", async () => {
            const opportunity = await (await createOpportunityViaApi()).json();
            const { POST: postCandidate } = await import("@/app/api/opportunities/[id]/candidates/route");
            await postCandidate(jsonRequest("POST", { projectId }), {
                params: Promise.resolve({ id: opportunity.id }),
            });

            const res = await getOpportunity(opportunity.id);
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({
                id: opportunity.id,
                title: "Spring Prize",
                provider: { id: providerId, name: "Contest Org" },
                candidates: [{ projectId, project: { id: projectId, title: "Test Project" }, submission: null }],
            });
        });

        it("returns 404 for an opportunity that does not exist", async () => {
            expect((await getOpportunity("missing")).status).toBe(404);
        });

        it("returns 403 for an opportunity owned by another user", async () => {
            const other = await prisma.user.create({
                data: { id: "opp-route-reader", email: "opp-reader@test.com", googleId: "google-opp-reader" },
            });
            const theirProvider = await prisma.provider.create({ data: { userId: other.id, name: "Their Org" } });
            const theirs = await prisma.opportunity.create({
                data: {
                    userId: other.id,
                    providerId: theirProvider.id,
                    title: "Their Prize",
                    closeDate: new Date(CLOSE_DATE),
                },
            });

            expect((await getOpportunity(theirs.id)).status).toBe(403);
        });

        it("returns 401 when Google auth is on and the caller is unauthenticated", async () => {
            const opportunity = await (await createOpportunityViaApi()).json();
            vi.mocked(getCurrentUserId).mockReturnValue(null);
            vi.mocked(isGoogleAuthMode).mockReturnValue(true);
            expect((await getOpportunity(opportunity.id)).status).toBe(401);
        });
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
        const candidateParams = { params: Promise.resolve({ id: opportunity.id, candidateId: candidate.id }) };

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

    it("returns 409 when the same project is put forward twice for one opportunity", async () => {
        const opportunity = await (await createOpportunityViaApi()).json();
        const opportunityParams = { params: Promise.resolve({ id: opportunity.id }) };

        const { POST } = await import("@/app/api/opportunities/[id]/candidates/route");
        expect((await POST(jsonRequest("POST", { projectId }), opportunityParams)).status).toBe(201);

        const duplicate = await POST(jsonRequest("POST", { projectId }), opportunityParams);
        expect(duplicate.status).toBe(409);
        expect((await duplicate.json()).error).toBe("A project can be a candidate for an opportunity only once.");
    });

    describe("a candidate reached through the wrong parent opportunity", () => {
        async function candidateUnderAnotherOpportunity() {
            const owner = await (await createOpportunityViaApi({ title: "Owning Prize" })).json();
            const impostor = await (await createOpportunityViaApi({ title: "Other Prize" })).json();

            const { POST } = await import("@/app/api/opportunities/[id]/candidates/route");
            const candidate = await (
                await POST(jsonRequest("POST", { projectId }), { params: Promise.resolve({ id: owner.id }) })
            ).json();

            return { candidate, mismatched: { params: Promise.resolve({ id: impostor.id, candidateId: candidate.id }) } };
        }

        it("is not patchable", async () => {
            const { candidate, mismatched } = await candidateUnderAnotherOpportunity();
            const { PATCH } = await import("@/app/api/opportunities/[id]/candidates/[candidateId]/route");

            expect((await PATCH(jsonRequest("PATCH", { state: "chosen" }), mismatched)).status).toBe(404);
            expect((await prisma.opportunityCandidate.findUnique({ where: { id: candidate.id } }))?.state).toBe(
                "candidate"
            );
        });

        it("is not deletable", async () => {
            const { candidate, mismatched } = await candidateUnderAnotherOpportunity();
            const { DELETE } = await import("@/app/api/opportunities/[id]/candidates/[candidateId]/route");

            expect((await DELETE(jsonRequest("DELETE"), mismatched)).status).toBe(404);
            expect(await prisma.opportunityCandidate.findUnique({ where: { id: candidate.id } })).not.toBeNull();
        });

        it("is not promotable", async () => {
            const { candidate, mismatched } = await candidateUnderAnotherOpportunity();
            await prisma.opportunityCandidate.update({ where: { id: candidate.id }, data: { state: "chosen" } });
            const { POST } = await import(
                "@/app/api/opportunities/[id]/candidates/[candidateId]/promote/route"
            );

            expect((await POST(jsonRequest("POST"), mismatched)).status).toBe(404);
            expect(await prisma.contestSubmission.count()).toBe(0);
        });
    });

    it("refuses to delete a provider that still has an opportunity", async () => {
        await createOpportunityViaApi();

        const { DELETE } = await import("@/app/api/providers/[id]/route");
        const res = await DELETE(jsonRequest("DELETE"), { params: Promise.resolve({ id: providerId }) });

        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe(
            "Provider has existing submissions or opportunities and cannot be deleted."
        );
        expect(await prisma.provider.findUnique({ where: { id: providerId } })).not.toBeNull();
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
