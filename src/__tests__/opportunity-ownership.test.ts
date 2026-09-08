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
import { mcpCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { ProjectsController } from "@/lib/controllers/projects";
import { OpportunityCandidateController } from "@/lib/controllers/opportunities";
import { createOpportunity, listOpportunities } from "@/mcp/tools/opportunities";
import { createProvider } from "@/mcp/tools/submissions";

const CLOSE_DATE = "2030-04-01T00:00:00.000Z";

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
    return new NextRequest(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

function opportunitiesRequest(method: string, body?: unknown): NextRequest {
    return jsonRequest("http://localhost/api/opportunities", method, body);
}

async function listViaWeb() {
    const { GET } = await import("@/app/api/opportunities/route");
    return GET(opportunitiesRequest("GET"));
}

async function getViaWeb(id: string) {
    const { GET } = await import("@/app/api/opportunities/[id]/route");
    return GET(new NextRequest(`http://localhost/api/opportunities/${id}`), {
        params: Promise.resolve({ id }),
    });
}

async function createViaWeb(providerId: string, title: string) {
    const { POST } = await import("@/app/api/opportunities/route");
    return POST(opportunitiesRequest("POST", { providerId, title, closeDate: CLOSE_DATE }));
}

describe("Opportunity ownership across MCP and the web UI", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // The MCP read helpers memoise per userId, and `null` is a single global bucket
        // that survives the per-test table truncation.
        mcpCache.clear();
        vi.mocked(getCurrentUserId).mockReturnValue(null);
        vi.mocked(isGoogleAuthMode).mockReturnValue(false);
    });

    describe("single-user deployment (no Google auth)", () => {
        it("shows an opportunity created over MCP in the web UI", async () => {
            const provider = await createProvider({ userId: null, name: "No Auth Org" });
            const created = await createOpportunity({
                userId: null,
                providerId: provider.id,
                title: "MCP Prize",
                closeDate: CLOSE_DATE,
            });

            const list = await listViaWeb();
            expect(list.status).toBe(200);
            expect(await list.json()).toMatchObject({
                total: 1,
                opportunities: [{ id: created.id, title: "MCP Prize" }],
            });

            const detail = await getViaWeb(created.id);
            expect(detail.status).toBe(200);
            expect(await detail.json()).toMatchObject({ id: created.id, title: "MCP Prize" });
        });

        it("shows an opportunity created in the web UI over MCP", async () => {
            const provider = await createProvider({ userId: null, name: "No Auth Org" });
            const created = await createViaWeb(provider.id, "Web Prize");
            expect(created.status).toBe(201);
            const { id } = await created.json();

            const { opportunities, total } = await listOpportunities(null);
            expect(total).toBe(1);
            expect(opportunities[0]).toMatchObject({ id, title: "Web Prize" });
        });

        it("carries the MCP-created opportunity into the publishing hub", async () => {
            const provider = await createProvider({ userId: null, name: "No Auth Org" });
            const created = await createOpportunity({
                userId: null,
                providerId: provider.id,
                title: "Hub Prize",
                closeDate: CLOSE_DATE,
            });

            const { GET } = await import("@/app/api/publishing/route");
            const res = await GET(new NextRequest("http://localhost/api/publishing"));
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({
                opportunities: [{ id: created.id, title: "Hub Prize" }],
            });
        });

        it("lists providers created over MCP", async () => {
            await createProvider({ userId: null, name: "No Auth Org" });

            const { GET } = await import("@/app/api/providers/route");
            const res = await GET(new NextRequest("http://localhost/api/providers"));
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ total: 1, providers: [{ name: "No Auth Org" }] });
        });

        it("lets the unidentified caller write to the rows it can see", async () => {
            const provider = await createProvider({ userId: null, name: "No Auth Org" });
            const opportunity = await createOpportunity({
                userId: null,
                providerId: provider.id,
                title: "Open Prize",
                closeDate: CLOSE_DATE,
            });
            const project = await ProjectsController.createProject({ title: "Null Owned Story", userId: null });

            const { PATCH: patchProvider } = await import("@/app/api/providers/[id]/route");
            const renamed = await patchProvider(
                jsonRequest(`http://localhost/api/providers/${provider.id}`, "PATCH", { name: "Renamed Org" }),
                { params: Promise.resolve({ id: provider.id }) }
            );
            expect(renamed.status).toBe(200);
            expect(await renamed.json()).toMatchObject({ name: "Renamed Org" });

            const { POST: createCandidate } = await import("@/app/api/opportunities/[id]/candidates/route");
            const candidate = await createCandidate(
                jsonRequest(
                    `http://localhost/api/opportunities/${opportunity.id}/candidates`,
                    "POST",
                    { projectId: project.id }
                ),
                { params: Promise.resolve({ id: opportunity.id }) }
            );
            expect(candidate.status).toBe(201);
        });
    });

    describe("multi-user deployment", () => {
        let userA: string;
        let userB: string;
        let providerA: string;
        let projectA: string;
        let opportunityA: string;
        let opportunityB: string;
        let candidateA: string;

        beforeEach(async () => {
            const a = await prisma.user.create({
                data: { id: "owner-a", email: "a@test.com", googleId: "google-a" },
            });
            const b = await prisma.user.create({
                data: { id: "owner-b", email: "b@test.com", googleId: "google-b" },
            });
            userA = a.id;
            userB = b.id;

            providerA = (await createProvider({ userId: userA, name: "A Org" })).id;
            const providerB = await createProvider({ userId: userB, name: "B Org" });
            projectA = (await ProjectsController.createProject({ title: "A Story", userId: userA })).id;
            opportunityA = (
                await createOpportunity({
                    userId: userA,
                    providerId: providerA,
                    title: "A Prize",
                    closeDate: CLOSE_DATE,
                })
            ).id;
            opportunityB = (
                await createOpportunity({
                    userId: userB,
                    providerId: providerB.id,
                    title: "B Prize",
                    closeDate: CLOSE_DATE,
                })
            ).id;
            candidateA = (
                await OpportunityCandidateController.createCandidate({
                    opportunityId: opportunityA,
                    userId: userA,
                    projectId: projectA,
                })
            ).id;
        });

        it("keeps one user's opportunities out of another's reads", async () => {
            vi.mocked(getCurrentUserId).mockReturnValue(userA);

            expect(await (await listViaWeb()).json()).toMatchObject({
                total: 1,
                opportunities: [{ id: opportunityA }],
            });
            expect((await listOpportunities(userA)).opportunities).toMatchObject([{ id: opportunityA }]);
            expect((await getViaWeb(opportunityB)).status).toBe(403);
        });

        it("keeps one user's opportunities out of another's writes", async () => {
            vi.mocked(getCurrentUserId).mockReturnValue(userA);
            const { PATCH, DELETE } = await import("@/app/api/opportunities/[id]/route");
            const params = { params: Promise.resolve({ id: opportunityB }) };

            expect(
                (await PATCH(opportunitiesRequest("PATCH", { status: "closed" }), params)).status
            ).toBe(403);
            expect((await DELETE(opportunitiesRequest("DELETE"), params)).status).toBe(403);
        });

        it("refuses an unidentified caller when Google auth is on", async () => {
            vi.mocked(isGoogleAuthMode).mockReturnValue(true);
            vi.mocked(getCurrentUserId).mockReturnValue(null);

            const { POST: createOpportunityRoute } = await import("@/app/api/opportunities/route");
            const { PATCH: patchOpportunity, DELETE: deleteOpportunity } = await import(
                "@/app/api/opportunities/[id]/route"
            );
            const { GET: listCandidates, POST: createCandidate } = await import(
                "@/app/api/opportunities/[id]/candidates/route"
            );
            const { PATCH: patchCandidate, DELETE: deleteCandidate } = await import(
                "@/app/api/opportunities/[id]/candidates/[candidateId]/route"
            );
            const { POST: promoteCandidate } = await import(
                "@/app/api/opportunities/[id]/candidates/[candidateId]/promote/route"
            );
            const { GET: listProviders, POST: createProviderRoute } = await import("@/app/api/providers/route");
            const { PATCH: patchProvider, DELETE: deleteProvider } = await import("@/app/api/providers/[id]/route");
            const { GET: getPublishing } = await import("@/app/api/publishing/route");

            const opportunityParams = { params: Promise.resolve({ id: opportunityA }) };
            const candidateParams = { params: Promise.resolve({ id: opportunityA, candidateId: candidateA }) };
            const providerParams = { params: Promise.resolve({ id: providerA }) };
            const candidatesUrl = `http://localhost/api/opportunities/${opportunityA}/candidates`;
            const candidateUrl = `${candidatesUrl}/${candidateA}`;
            const providersUrl = "http://localhost/api/providers";
            const providerUrl = `${providersUrl}/${providerA}`;

            const calls: Array<[string, Promise<Response>]> = [
                ["GET /opportunities", listViaWeb()],
                [
                    "POST /opportunities",
                    createOpportunityRoute(
                        opportunitiesRequest("POST", { providerId: providerA, title: "t", closeDate: CLOSE_DATE })
                    ),
                ],
                ["GET /opportunities/[id]", getViaWeb(opportunityA)],
                [
                    "PATCH /opportunities/[id]",
                    patchOpportunity(opportunitiesRequest("PATCH", { status: "closed" }), opportunityParams),
                ],
                ["DELETE /opportunities/[id]", deleteOpportunity(opportunitiesRequest("DELETE"), opportunityParams)],
                ["GET /opportunities/[id]/candidates", listCandidates(jsonRequest(candidatesUrl, "GET"), opportunityParams)],
                [
                    "POST /opportunities/[id]/candidates",
                    createCandidate(jsonRequest(candidatesUrl, "POST", { projectId: projectA }), opportunityParams),
                ],
                [
                    "PATCH /opportunities/[id]/candidates/[candidateId]",
                    patchCandidate(jsonRequest(candidateUrl, "PATCH", { state: "chosen" }), candidateParams),
                ],
                [
                    "DELETE /opportunities/[id]/candidates/[candidateId]",
                    deleteCandidate(jsonRequest(candidateUrl, "DELETE"), candidateParams),
                ],
                [
                    "POST /opportunities/[id]/candidates/[candidateId]/promote",
                    promoteCandidate(jsonRequest(`${candidateUrl}/promote`, "POST"), candidateParams),
                ],
                ["GET /providers", listProviders(jsonRequest(providersUrl, "GET"))],
                ["POST /providers", createProviderRoute(jsonRequest(providersUrl, "POST", { name: "New Org" }))],
                ["PATCH /providers/[id]", patchProvider(jsonRequest(providerUrl, "PATCH", { name: "Renamed" }), providerParams)],
                ["DELETE /providers/[id]", deleteProvider(jsonRequest(providerUrl, "DELETE"), providerParams)],
                // DELETE guards before resolving, so an unknown id is the only input that tells its
                // own guard apart from the one inside resolveProvider (which 404s before it checks).
                [
                    "DELETE /providers/[id] (unknown id)",
                    deleteProvider(jsonRequest(`${providersUrl}/no-such-provider`, "DELETE"), {
                        params: Promise.resolve({ id: "no-such-provider" }),
                    }),
                ],
                ["GET /publishing", getPublishing(new NextRequest("http://localhost/api/publishing"))],
            ];

            const statuses = Object.fromEntries(
                await Promise.all(calls.map(async ([route, response]) => [route, (await response).status]))
            );
            expect(statuses).toEqual(Object.fromEntries(calls.map(([route]) => [route, 401])));
        });
    });
});
