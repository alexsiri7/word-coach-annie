import { describe, it, expect, vi, beforeEach } from "vitest";
import { HashnodePublishController } from "@/lib/controllers/hashnode-publish";
import { testPrisma } from "./setup";
import { encrypt } from "@/lib/crypto";

vi.mock("@/mcp/tools/export", () => ({
    exportHashnode: vi.fn().mockResolvedValue("# Test Article\n\nSome content here."),
    exportMedium: vi.fn().mockResolvedValue("# Test Article\n\nSome content here."),
}));

const DRAFT_RESPONSE = {
    data: {
        createDraft: {
            draft: { id: "draft-123", slug: "test-article" },
        },
    },
};

const PUBLISH_RESPONSE = {
    data: {
        publishPost: {
            post: {
                id: "post-456",
                url: "https://testuser.hashnode.dev/test-article",
                slug: "test-article",
            },
        },
    },
};

function mockFetchDraft() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(DRAFT_RESPONSE),
    } as unknown as Response);
}

function mockFetchPublish() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(PUBLISH_RESPONSE),
    } as unknown as Response);
}

function mockFetchFailure(status: number, body: string) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: vi.fn().mockResolvedValue(body),
    } as unknown as Response);
}

describe("HashnodePublishController", () => {
    let projectId: string;
    let credId: string;

    beforeEach(async () => {
        const project = await testPrisma.project.create({
            data: { title: "My Story", author: "Test Author" },
        });
        projectId = project.id;

        const cred = await testPrisma.hashnodeCredential.create({
            data: {
                userId: "local",
                integrationToken: encrypt("fake-pat"),
                publicationId: "pub-789",
                username: "testuser",
            },
        });
        credId = cred.id;
    });

    describe("publish", () => {
        it("creates a draft on Hashnode and stores export record", async () => {
            mockFetchDraft();

            const result = await HashnodePublishController.publish(projectId, null, {
                publishStatus: "draft",
            });

            expect(result.hashnodePostId).toBe("draft-123");
            expect(result.hashnodePostUrl).toBe("https://hashnode.com/draft/draft-123");
            expect(result.publishStatus).toBe("draft");
            expect(result.alreadyPublished).toBeUndefined();

            const exports = await testPrisma.hashnodeExport.findMany({ where: { projectId } });
            expect(exports).toHaveLength(1);
            expect(exports[0].hashnodePostId).toBe("draft-123");
            expect(exports[0].credentialId).toBe(credId);
        });

        it("publishes public post to Hashnode", async () => {
            mockFetchPublish();

            const result = await HashnodePublishController.publish(projectId, null, {
                publishStatus: "public",
            });

            expect(result.hashnodePostId).toBe("post-456");
            expect(result.hashnodePostUrl).toBe("https://testuser.hashnode.dev/test-article");
            expect(result.publishStatus).toBe("public");

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.variables.input.isHiddenFromHashnodeFeed).toBe(false);
        });

        it("publishes unlisted post with isHiddenFromHashnodeFeed=true", async () => {
            mockFetchPublish();

            await HashnodePublishController.publish(projectId, null, {
                publishStatus: "unlisted",
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.variables.input.isHiddenFromHashnodeFeed).toBe(true);
        });

        it("publishes a specific node", async () => {
            const node = await testPrisma.structureNode.create({
                data: { projectId, type: "SCENE", title: "My Article", orderIndex: 0 },
            });
            mockFetchDraft();

            const result = await HashnodePublishController.publish(projectId, null, {
                nodeId: node.id,
                publishStatus: "draft",
            });

            expect(result.hashnodePostId).toBe("draft-123");
            const exports = await testPrisma.hashnodeExport.findMany({ where: { projectId } });
            expect(exports[0].nodeId).toBe(node.id);
        });

        it("uses titleOverride when provided", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {
                titleOverride: "Custom Title",
                publishStatus: "draft",
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.variables.input.title).toBe("Custom Title");
        });

        it("uses project title when no titleOverride or nodeId", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {});

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.variables.input.title).toBe("My Story");
        });

        it("sends tags and canonicalUrl to Hashnode API", async () => {
            mockFetchPublish();

            await HashnodePublishController.publish(projectId, null, {
                publishStatus: "public",
                tags: ["fiction", "fantasy"],
                canonicalUrl: "https://mysite.com/article",
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.variables.input.tags).toEqual([
                { name: "fiction", slug: "fiction" },
                { name: "fantasy", slug: "fantasy" },
            ]);
            expect(body.variables.input.originalArticleURL).toBe("https://mysite.com/article");
        });

        it("sends publicationId in the request", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {});

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.variables.input.publicationId).toBe("pub-789");
        });

        it("sends Authorization header without Bearer prefix", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {});

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(fetchCall[1].headers.Authorization).toBe("fake-pat");
            expect(fetchCall[1].headers.Authorization).not.toMatch(/^Bearer /);
        });

        it("throws when Hashnode account is not connected", async () => {
            await testPrisma.hashnodeCredential.deleteMany();

            await expect(
                HashnodePublishController.publish(projectId, null, {})
            ).rejects.toThrow("Hashnode account not connected");
        });

        it("updates existing draft when export record exists with publishStatus=draft", async () => {
            await testPrisma.hashnodeExport.create({
                data: {
                    projectId,
                    nodeId: null,
                    hashnodePostId: "existing-draft-id",
                    hashnodePostUrl: "https://hashnode.com/draft/existing-draft-id",
                    publishStatus: "draft",
                    lastSyncedAt: new Date(),
                    credentialId: credId,
                },
            });

            const UPDATE_DRAFT_RESPONSE = {
                data: { updateDraft: { draft: { id: "existing-draft-id", title: "My Story" } } },
            };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(UPDATE_DRAFT_RESPONSE),
            } as unknown as Response);

            const result = await HashnodePublishController.publish(projectId, null, {});

            expect(result.updated).toBe(true);
            expect(result.hashnodePostId).toBe("existing-draft-id");
            expect(result.alreadyPublished).toBeUndefined();

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.query).toContain("UpdateDraft");
            expect(body.variables.input.id).toBe("existing-draft-id");
        });

        it("updates existing published post when export record exists with publishStatus=public", async () => {
            await testPrisma.hashnodeExport.create({
                data: {
                    projectId,
                    nodeId: null,
                    hashnodePostId: "existing-post-id",
                    hashnodePostUrl: "https://testuser.hashnode.dev/existing",
                    publishStatus: "public",
                    lastSyncedAt: new Date(),
                    credentialId: credId,
                },
            });

            const UPDATE_POST_RESPONSE = {
                data: { updatePost: { post: { id: "existing-post-id", url: "https://testuser.hashnode.dev/existing" } } },
            };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(UPDATE_POST_RESPONSE),
            } as unknown as Response);

            const result = await HashnodePublishController.publish(projectId, null, {});

            expect(result.updated).toBe(true);
            expect(result.hashnodePostId).toBe("existing-post-id");

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.query).toContain("UpdatePost");
            expect(body.variables.input.id).toBe("existing-post-id");
        });

        it("throws when Hashnode API returns an error", async () => {
            mockFetchFailure(401, '{"errors":[{"message":"Unauthorized"}]}');

            await expect(
                HashnodePublishController.publish(projectId, null, {})
            ).rejects.toThrow("Hashnode API error (401)");
        });

        it("uses userId when provided (multi-user mode)", async () => {
            const user = await testPrisma.user.create({
                data: { id: "user-abc", email: "user@example.com", googleId: "google-user-abc" },
            });
            await testPrisma.hashnodeCredential.create({
                data: {
                    userId: user.id,
                    integrationToken: encrypt("user-token"),
                    publicationId: "user-pub-id",
                    username: "useruser",
                },
            });
            mockFetchDraft();

            const result = await HashnodePublishController.publish(projectId, user.id, {});

            expect(result.hashnodePostId).toBe("draft-123");
            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.variables.input.publicationId).toBe("user-pub-id");
        });
    });
});
