import { describe, it, expect, beforeEach } from "vitest";
import {
    listProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    listContestSubmissions,
    createContestSubmission,
    updateContestSubmission,
    deleteContestSubmission,
    listPublicationSubmissions,
    createPublicationSubmission,
    updatePublicationSubmission,
    deletePublicationSubmission,
} from "@/mcp/tools/submissions";
import { ProjectsController } from "@/lib/controllers/projects";
import { prisma } from "@/lib/db";

describe("MCP Submission Tools", () => {
    let projectId: string;
    let userId: string;

    beforeEach(async () => {
        const user = await prisma.user.create({
            data: { id: "sub-user-1", email: "sub-user-1@test.com", googleId: "google-sub-user-1", name: "Test User" },
        });
        userId = user.id;
        const project = await ProjectsController.createProject({ title: "Test Project", userId });
        projectId = project.id;
    });

    describe("Provider tools", () => {
        it("creates and lists providers scoped to the current user", async () => {
            await createProvider({ userId, name: "Fictionmag", website: "https://example.com" });
            const { providers, total } = await listProviders(userId);
            expect(total).toBe(1);
            expect(providers[0].name).toBe("Fictionmag");
        });

        it("does not list another user's providers", async () => {
            await createProvider({ userId, name: "Mine" });
            const { total } = await listProviders("someone-else");
            expect(total).toBe(0);
        });

        it("supports the single-user (no auth) path — null userId is passed through, not substituted", async () => {
            const created = await createProvider({ userId: null, name: "No Auth Provider" });
            const stored = await prisma.provider.findUnique({ where: { id: created.id } });
            expect(stored?.userId).toBeNull();

            const { total, providers } = await listProviders(null);
            expect(total).toBe(1);
            expect(providers[0].name).toBe("No Auth Provider");

            const updated = await updateProvider({ providerId: created.id, userId: null, name: "Renamed" });
            expect(updated.name).toBe("Renamed");

            const result = await deleteProvider(created.id, null);
            expect(result.success).toBe(true);
        });

        it("updates specified fields and returns the provider", async () => {
            const created = await createProvider({ userId, name: "Original" });
            const updated = await updateProvider({ providerId: created.id, userId, name: "Revised" });
            expect(updated.name).toBe("Revised");
        });

        it("throws when no optional fields are provided to updateProvider", async () => {
            const created = await createProvider({ userId, name: "Original" });
            await expect(updateProvider({ providerId: created.id, userId }))
                .rejects.toThrow("No fields provided to update");
        });

        it("rejects updating a provider owned by a different user", async () => {
            const created = await createProvider({ userId, name: "Original" });
            await expect(updateProvider({ providerId: created.id, userId: "someone-else", name: "Hijacked" }))
                .rejects.toThrow("Forbidden");
        });

        it("deletes a provider owned by the current user", async () => {
            const created = await createProvider({ userId, name: "ToDelete" });
            const result = await deleteProvider(created.id, userId);
            expect(result.success).toBe(true);
            const { total } = await listProviders(userId);
            expect(total).toBe(0);
        });

        it("rejects deleting a provider owned by a different user", async () => {
            const created = await createProvider({ userId, name: "Protected" });
            await expect(deleteProvider(created.id, "someone-else")).rejects.toThrow("Forbidden");
        });

        it("invalidates cache so subsequent listProviders reflects the update", async () => {
            const created = await createProvider({ userId, name: "Before" });
            await listProviders(userId); // warm cache
            await updateProvider({ providerId: created.id, userId, name: "After" });
            const { providers } = await listProviders(userId);
            expect(providers.find((p) => p.id === created.id)?.name).toBe("After");
        });
    });

    describe("Contest submission tools", () => {
        let providerId: string;

        beforeEach(async () => {
            const provider = await createProvider({ userId, name: "Contest Provider" });
            providerId = provider.id;
        });

        it("creates and lists contest submissions for a project", async () => {
            await createContestSubmission({
                projectId,
                providerId,
                contestName: "Big Contest",
                submissionDate: new Date().toISOString(),
            });
            const { submissions, total } = await listContestSubmissions({ projectId });
            expect(total).toBe(1);
            expect(submissions[0].contestName).toBe("Big Contest");
            expect(submissions[0].provider.id).toBe(providerId);
        });

        it("updates specified fields and returns the submission", async () => {
            const created = await createContestSubmission({
                projectId,
                providerId,
                contestName: "Original",
                submissionDate: new Date().toISOString(),
            });
            const updated = await updateContestSubmission({ submissionId: created.id, status: "accepted" });
            expect(updated.status).toBe("accepted");
            expect(updated.contestName).toBe("Original"); // unchanged field preserved
        });

        it("throws when no optional fields are provided to updateContestSubmission", async () => {
            const created = await createContestSubmission({
                projectId,
                providerId,
                contestName: "Original",
                submissionDate: new Date().toISOString(),
            });
            await expect(updateContestSubmission({ submissionId: created.id }))
                .rejects.toThrow("No fields provided to update");
        });

        it("deletes a contest submission", async () => {
            const created = await createContestSubmission({
                projectId,
                providerId,
                contestName: "ToDelete",
                submissionDate: new Date().toISOString(),
            });
            const result = await deleteContestSubmission(created.id);
            expect(result.success).toBe(true);
            const { total } = await listContestSubmissions({ projectId });
            expect(total).toBe(0);
        });

        it("invalidates cache so subsequent listContestSubmissions reflects the update", async () => {
            const created = await createContestSubmission({
                projectId,
                providerId,
                contestName: "Before",
                submissionDate: new Date().toISOString(),
            });
            await listContestSubmissions({ projectId }); // warm cache
            await updateContestSubmission({ submissionId: created.id, contestName: "After" });
            const { submissions } = await listContestSubmissions({ projectId });
            expect(submissions.find((s) => s.id === created.id)?.contestName).toBe("After");
        });
    });

    describe("Publication submission tools", () => {
        it("creates and lists publication submissions for a project", async () => {
            await createPublicationSubmission({
                projectId,
                venueName: "Big Magazine",
                submissionDate: new Date().toISOString(),
            });
            const { submissions, total } = await listPublicationSubmissions({ projectId });
            expect(total).toBe(1);
            expect(submissions[0].venueName).toBe("Big Magazine");
        });

        it("updates specified fields and returns the submission", async () => {
            const created = await createPublicationSubmission({
                projectId,
                venueName: "Original",
                submissionDate: new Date().toISOString(),
            });
            const updated = await updatePublicationSubmission({ submissionId: created.id, status: "rejected" });
            expect(updated.status).toBe("rejected");
            expect(updated.venueName).toBe("Original"); // unchanged field preserved
        });

        it("throws when no optional fields are provided to updatePublicationSubmission", async () => {
            const created = await createPublicationSubmission({
                projectId,
                venueName: "Original",
                submissionDate: new Date().toISOString(),
            });
            await expect(updatePublicationSubmission({ submissionId: created.id }))
                .rejects.toThrow("No fields provided to update");
        });

        it("deletes a publication submission", async () => {
            const created = await createPublicationSubmission({
                projectId,
                venueName: "ToDelete",
                submissionDate: new Date().toISOString(),
            });
            const result = await deletePublicationSubmission(created.id);
            expect(result.success).toBe(true);
            const { total } = await listPublicationSubmissions({ projectId });
            expect(total).toBe(0);
        });

        it("invalidates cache so subsequent listPublicationSubmissions reflects the update", async () => {
            const created = await createPublicationSubmission({
                projectId,
                venueName: "Before",
                submissionDate: new Date().toISOString(),
            });
            await listPublicationSubmissions({ projectId }); // warm cache
            await updatePublicationSubmission({ submissionId: created.id, venueName: "After" });
            const { submissions } = await listPublicationSubmissions({ projectId });
            expect(submissions.find((s) => s.id === created.id)?.venueName).toBe("After");
        });
    });
});
