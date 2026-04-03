import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediumPublishController } from "@/lib/controllers/medium-publish";
import { testPrisma } from "./setup";
import { encrypt } from "@/lib/crypto";

// Mock exportMedium to return predictable content
vi.mock("@/mcp/tools/export", () => ({
    exportMedium: vi.fn().mockResolvedValue("# Test Article\n\nSome content here."),
}));

const MEDIUM_POST_RESPONSE = {
    data: {
        id: "medium-post-123",
        url: "https://medium.com/@user/test-article-abc123",
        publishStatus: "draft",
    },
};

function mockFetchSuccess() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(MEDIUM_POST_RESPONSE),
    } as unknown as Response);
}

function mockFetchFailure(status: number, body: string) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: vi.fn().mockResolvedValue(body),
    } as unknown as Response);
}

describe("MediumPublishController", () => {
    let projectId: string;
    let credId: string;

    beforeEach(async () => {
        // Create local user required by MediumCredential FK (local/single-user mode)
        await testPrisma.user.create({
            data: { id: "local", email: "local@wordcoach.local", googleId: "local" },
        });

        // Create a project
        const project = await testPrisma.project.create({
            data: { title: "My Story", author: "Test Author" },
        });
        projectId = project.id;

        // Create a medium credential (local/single-user mode)
        const cred = await testPrisma.mediumCredential.create({
            data: {
                userId: "local",
                integrationToken: encrypt("fake-integration-token"),
                authorId: "medium-author-456",
                username: "testuser",
            },
        });
        credId = cred.id;
    });

    describe("publish", () => {
        it("publishes project to Medium and stores export record", async () => {
            mockFetchSuccess();

            const result = await MediumPublishController.publish(projectId, null, {
                publishStatus: "draft",
            });

            expect(result.mediumPostId).toBe("medium-post-123");
            expect(result.mediumPostUrl).toBe("https://medium.com/@user/test-article-abc123");
            expect(result.publishStatus).toBe("draft");
            expect(result.alreadyPublished).toBeUndefined();

            // Verify export stored in DB
            const exports = await testPrisma.mediumExport.findMany({ where: { projectId } });
            expect(exports).toHaveLength(1);
            expect(exports[0].mediumPostId).toBe("medium-post-123");
            expect(exports[0].credentialId).toBe(credId);
        });

        it("publishes a specific node to Medium", async () => {
            const node = await testPrisma.structureNode.create({
                data: { projectId, type: "SCENE", title: "My Article", orderIndex: 0 },
            });
            mockFetchSuccess();

            const result = await MediumPublishController.publish(projectId, null, {
                nodeId: node.id,
                publishStatus: "public",
            });

            expect(result.mediumPostId).toBe("medium-post-123");

            const exports = await testPrisma.mediumExport.findMany({ where: { projectId } });
            expect(exports[0].nodeId).toBe(node.id);
        });

        it("uses titleOverride when provided", async () => {
            mockFetchSuccess();

            await MediumPublishController.publish(projectId, null, {
                titleOverride: "Custom Title",
                publishStatus: "draft",
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.title).toBe("Custom Title");
        });

        it("uses project title when no titleOverride or nodeId", async () => {
            mockFetchSuccess();

            await MediumPublishController.publish(projectId, null, {});

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.title).toBe("My Story");
        });

        it("sends tags and canonicalUrl to Medium API", async () => {
            mockFetchSuccess();

            await MediumPublishController.publish(projectId, null, {
                tags: ["fiction", "fantasy"],
                canonicalUrl: "https://mysite.com/article",
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.tags).toEqual(["fiction", "fantasy"]);
            expect(requestBody.canonicalUrl).toBe("https://mysite.com/article");
        });

        it("throws when Medium account is not connected", async () => {
            await testPrisma.mediumCredential.deleteMany();

            await expect(
                MediumPublishController.publish(projectId, null, {})
            ).rejects.toThrow("Medium account not connected");
        });

        it("throws when title exceeds 100 characters", async () => {
            const longTitle = "A".repeat(101);
            await expect(
                MediumPublishController.publish(projectId, null, { titleOverride: longTitle })
            ).rejects.toThrow("Title exceeds 100 characters");
        });

        it("throws when more than 3 tags provided", async () => {
            mockFetchSuccess();
            await expect(
                MediumPublishController.publish(projectId, null, {
                    tags: ["a", "b", "c", "d"],
                })
            ).rejects.toThrow("maximum of 3 tags");
        });

        it("returns alreadyPublished when export record exists", async () => {
            // Create existing export record
            await testPrisma.mediumExport.create({
                data: {
                    projectId,
                    nodeId: null,
                    mediumPostId: "existing-post-id",
                    mediumPostUrl: "https://medium.com/@user/existing-post",
                    publishStatus: "public",
                    lastSyncedAt: new Date(),
                    credentialId: credId,
                },
            });

            const result = await MediumPublishController.publish(projectId, null, {});

            expect(result.alreadyPublished).toBe(true);
            expect(result.mediumPostId).toBe("existing-post-id");
            expect(result.mediumPostUrl).toBe("https://medium.com/@user/existing-post");
            // fetch should NOT have been called
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("throws when Medium API returns an error", async () => {
            mockFetchFailure(401, '{"errors":[{"message":"Token invalid"}]}');

            await expect(
                MediumPublishController.publish(projectId, null, {})
            ).rejects.toThrow("Medium API error (401)");
        });

        it("calls Medium API with correct URL including authorId", async () => {
            mockFetchSuccess();

            await MediumPublishController.publish(projectId, null, {});

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(fetchCall[0]).toContain("/users/medium-author-456/posts");
        });

        it("uses userId when provided (multi-user mode)", async () => {
            // Create a user and credential for them
            const user = await testPrisma.user.create({
                data: { id: "user-abc", email: "user@example.com", googleId: "google-user-abc" },
            });
            await testPrisma.mediumCredential.create({
                data: {
                    userId: user.id,
                    integrationToken: encrypt("user-token"),
                    authorId: "user-author-id",
                    username: "useruser",
                },
            });
            mockFetchSuccess();

            const result = await MediumPublishController.publish(projectId, user.id, {});

            expect(result.mediumPostId).toBe("medium-post-123");
            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(fetchCall[0]).toContain("/users/user-author-id/posts");
        });
    });
});
