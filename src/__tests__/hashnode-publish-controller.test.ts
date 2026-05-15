import { describe, it, expect, vi, beforeEach } from "vitest";
import { HashnodePublishController } from "@/lib/controllers/hashnode-publish";
import { testPrisma } from "./setup";
import { encrypt } from "@/lib/crypto";

// Mock exportHashnode to return predictable content
vi.mock("@/mcp/tools/export", () => ({
    exportHashnode: vi.fn().mockResolvedValue("# Test Article\n\nSome content here."),
}));

const HASHNODE_DRAFT_RESPONSE = {
    data: {
        createDraft: {
            draft: {
                id: "hashnode-draft-123",
                title: "Test Article",
            },
        },
    },
};

const HASHNODE_PUBLISH_RESPONSE = {
    data: {
        publishPost: {
            post: {
                id: "hashnode-post-456",
                url: "https://testuser.hashnode.dev/test-article",
            },
        },
    },
};

const HASHNODE_UPDATE_DRAFT_RESPONSE = {
    data: {
        updateDraft: {
            draft: {
                id: "existing-draft-id",
                title: "Test Article",
            },
        },
    },
};

const HASHNODE_UPDATE_POST_RESPONSE = {
    data: {
        updatePost: {
            post: {
                id: "existing-post-id",
                url: "https://testuser.hashnode.dev/existing-post",
            },
        },
    },
};

function mockFetchDraft() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(HASHNODE_DRAFT_RESPONSE),
    } as unknown as Response);
}

function mockFetchPublish() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(HASHNODE_PUBLISH_RESPONSE),
    } as unknown as Response);
}

function mockFetchFailure(status: number, body: string) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: vi.fn().mockResolvedValue(body),
    } as unknown as Response);
}

function mockFetchGraphQLError(message: string) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ errors: [{ message }] }),
    } as unknown as Response);
}

function mockFetchUpdateDraft() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(HASHNODE_UPDATE_DRAFT_RESPONSE),
    } as unknown as Response);
}

function mockFetchUpdatePost() {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(HASHNODE_UPDATE_POST_RESPONSE),
    } as unknown as Response);
}

describe("HashnodePublishController", () => {
    let projectId: string;
    let credId: string;

    beforeEach(async () => {
        global.fetch = vi.fn();

        const project = await testPrisma.project.create({
            data: { title: "My Story", author: "Test Author" },
        });
        projectId = project.id;

        const cred = await testPrisma.hashnodeCredential.create({
            data: {
                userId: "local",
                accessToken: encrypt("fake-access-token"),
                publicationId: "pub-abc-123",
                username: "testuser",
            },
        });
        credId = cred.id;
    });

    describe("publish (draft mode)", () => {
        it("creates a draft on Hashnode and stores export record", async () => {
            mockFetchDraft();

            const result = await HashnodePublishController.publish(projectId, null, {
                publishStatus: "draft",
            });

            expect(result.hashnodePostId).toBe("hashnode-draft-123");
            expect(result.hashnodePostUrl).toBe("https://hashnode.com/draft/hashnode-draft-123");
            expect(result.publishStatus).toBe("draft");
            expect(result.alreadyPublished).toBeUndefined();

            const exports = await testPrisma.hashnodeExport.findMany({ where: { projectId } });
            expect(exports).toHaveLength(1);
            expect(exports[0].hashnodePostId).toBe("hashnode-draft-123");
            expect(exports[0].credentialId).toBe(credId);
            expect(exports[0].publishStatus).toBe("draft");
        });

        it("calls createDraft mutation for draft status", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, { publishStatus: "draft" });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.query).toContain("createDraft");
        });
    });

    describe("publish (public/unlisted mode)", () => {
        it("publishes a public post and stores export record", async () => {
            mockFetchPublish();

            const result = await HashnodePublishController.publish(projectId, null, {
                publishStatus: "public",
            });

            expect(result.hashnodePostId).toBe("hashnode-post-456");
            expect(result.hashnodePostUrl).toBe("https://testuser.hashnode.dev/test-article");
            expect(result.publishStatus).toBe("public");

            const exports = await testPrisma.hashnodeExport.findMany({ where: { projectId } });
            expect(exports[0].publishStatus).toBe("public");
        });

        it("calls publishPost mutation for public status", async () => {
            mockFetchPublish();

            await HashnodePublishController.publish(projectId, null, { publishStatus: "public" });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.query).toContain("publishPost");
        });

        it("sets isDelisted flag for unlisted posts", async () => {
            mockFetchPublish();

            await HashnodePublishController.publish(projectId, null, { publishStatus: "unlisted" });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.settings.isDelisted).toBe(true);
        });
    });

    describe("title resolution", () => {
        it("uses titleOverride when provided", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {
                titleOverride: "Custom Title",
                publishStatus: "draft",
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.title).toBe("Custom Title");
        });

        it("uses project title when no titleOverride or nodeId", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {});

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.title).toBe("My Story");
        });

        it("uses node title when nodeId is provided", async () => {
            const node = await testPrisma.structureNode.create({
                data: { projectId, type: "SCENE", title: "My Article", orderIndex: 0 },
            });
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, { nodeId: node.id });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.title).toBe("My Article");
        });

        it("throws when nodeId belongs to a different project", async () => {
            const otherProject = await testPrisma.project.create({
                data: { title: "Other Project", author: "Other Author" },
            });
            const node = await testPrisma.structureNode.create({
                data: { projectId: otherProject.id, type: "SCENE", title: "Secret Title", orderIndex: 0 },
            });
            mockFetchDraft();

            await expect(
                HashnodePublishController.publish(projectId, null, { nodeId: node.id })
            ).rejects.toThrow(`Node not found: ${node.id}`);
        });
    });

    describe("tags and canonical URL", () => {
        it("sends tags to Hashnode API", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {
                tags: ["fiction", "fantasy"],
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.tags).toEqual([
                { name: "fiction", slug: "fiction" },
                { name: "fantasy", slug: "fantasy" },
            ]);
        });

        it("slugifies multi-word and uppercase tags", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {
                tags: ["My Tag", "Science Fiction", "UPPER"],
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.tags).toEqual([
                { name: "My Tag", slug: "my-tag" },
                { name: "Science Fiction", slug: "science-fiction" },
                { name: "UPPER", slug: "upper" },
            ]);
        });

        it("sends canonicalUrl as originalArticleURL", async () => {
            mockFetchDraft();

            await HashnodePublishController.publish(projectId, null, {
                canonicalUrl: "https://mysite.com/article",
            });

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.originalArticleURL).toBe("https://mysite.com/article");
        });
    });

    describe("error handling", () => {
        it("throws when Hashnode account is not connected", async () => {
            await testPrisma.hashnodeCredential.deleteMany();

            await expect(
                HashnodePublishController.publish(projectId, null, {})
            ).rejects.toThrow("Hashnode account not connected");
        });

        it("throws when Hashnode API returns HTTP error", async () => {
            mockFetchFailure(500, "Internal server error");

            await expect(
                HashnodePublishController.publish(projectId, null, {})
            ).rejects.toThrow("Hashnode API error (500)");
        });

        it("throws when Hashnode API returns GraphQL errors", async () => {
            mockFetchGraphQLError("Token is invalid");

            await expect(
                HashnodePublishController.publish(projectId, null, {})
            ).rejects.toThrow("Hashnode API error: Token is invalid");
        });
    });

    describe("update flow (existing export)", () => {
        it("calls updateDraft when existing export has draft status", async () => {
            mockFetchUpdateDraft();

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

            const result = await HashnodePublishController.publish(projectId, null, {});

            expect(result.updated).toBe(true);
            expect(result.hashnodePostId).toBe("existing-draft-id");
            expect(result.alreadyPublished).toBeUndefined();

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.query).toContain("updateDraft");
            expect(requestBody.variables.input.draftId).toBe("existing-draft-id");
        });

        it("calls updatePost when existing export has public status", async () => {
            mockFetchUpdatePost();

            await testPrisma.hashnodeExport.create({
                data: {
                    projectId,
                    nodeId: null,
                    hashnodePostId: "existing-post-id",
                    hashnodePostUrl: "https://testuser.hashnode.dev/existing-post",
                    publishStatus: "public",
                    lastSyncedAt: new Date(),
                    credentialId: credId,
                },
            });

            const result = await HashnodePublishController.publish(projectId, null, {});

            expect(result.updated).toBe(true);
            expect(result.hashnodePostId).toBe("existing-post-id");

            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.query).toContain("updatePost");
            expect(requestBody.variables.input.postId).toBe("existing-post-id");
        });

        it("updates lastSyncedAt on the export record", async () => {
            mockFetchUpdateDraft();
            const oldDate = new Date("2024-01-01");

            await testPrisma.hashnodeExport.create({
                data: {
                    projectId,
                    nodeId: null,
                    hashnodePostId: "existing-draft-id",
                    hashnodePostUrl: "https://hashnode.com/draft/existing-draft-id",
                    publishStatus: "draft",
                    lastSyncedAt: oldDate,
                    credentialId: credId,
                },
            });

            await HashnodePublishController.publish(projectId, null, {});

            const updated = await testPrisma.hashnodeExport.findFirst({ where: { projectId } });
            expect(updated!.lastSyncedAt.getTime()).toBeGreaterThan(oldDate.getTime());
        });
    });

    describe("multi-user mode", () => {
        it("uses userId-specific credential when userId is provided", async () => {
            const user = await testPrisma.user.create({
                data: { id: "user-abc", email: "user@example.com", googleId: "google-user-abc" },
            });
            await testPrisma.hashnodeCredential.create({
                data: {
                    userId: user.id,
                    accessToken: encrypt("user-access-token"),
                    publicationId: "user-pub-id",
                    username: "useruser",
                },
            });
            mockFetchDraft();

            const result = await HashnodePublishController.publish(projectId, user.id, {});

            expect(result.hashnodePostId).toBe("hashnode-draft-123");
            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const requestBody = JSON.parse(fetchCall[1].body);
            expect(requestBody.variables.input.publicationId).toBe("user-pub-id");
        });
    });
});
