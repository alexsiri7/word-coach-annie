import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { MediumPublishController } from "@/lib/controllers/medium-publish";

// Mock exportMedium so tests don't need real project content
vi.mock("@/mcp/tools/export", () => ({
    exportMedium: vi.fn().mockResolvedValue("# Test Article\n\nSome content here."),
}));

// Mock fetch to avoid real Medium API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeMediumPostResponse(postId = "post-123", url = "https://medium.com/@user/post-123") {
    return {
        ok: true,
        json: () => Promise.resolve({ data: { id: postId, url } }),
        text: () => Promise.resolve(""),
        status: 201,
    };
}

describe("MediumPublishController", () => {
    let projectId: string;
    let credentialId: string;

    beforeEach(async () => {
        mockFetch.mockReset();

        // Create a user and credential (single-user mode uses userId='local')
        await testPrisma.user.create({
            data: { id: "local-user", email: "local@example.com", googleId: "google-local" },
        });

        const project = await testPrisma.project.create({
            data: { title: "My Story", userId: "local-user" },
        });
        projectId = project.id;

        const credential = await testPrisma.mediumCredential.create({
            data: {
                userId: "local",
                integrationToken: "raw-token",
                authorId: "author-abc",
                username: "testuser",
            },
        });
        credentialId = credential.id;
    });

    it("publishes a project and stores export record", async () => {
        mockFetch.mockResolvedValue(makeMediumPostResponse("post-xyz", "https://medium.com/p/post-xyz"));

        const result = await MediumPublishController.publish({ projectId }, null);

        expect(result.mediumPostId).toBe("post-xyz");
        expect(result.mediumPostUrl).toBe("https://medium.com/p/post-xyz");
        expect(result.publishStatus).toBe("draft");
        expect(result.alreadyPublished).toBeUndefined();

        // Verify export record stored
        const stored = await testPrisma.mediumExport.findFirst({ where: { projectId } });
        expect(stored).not.toBeNull();
        expect(stored!.mediumPostId).toBe("post-xyz");
        expect(stored!.publishStatus).toBe("draft");
        expect(stored!.credentialId).toBe(credentialId);
    });

    it("returns alreadyPublished=true if export record exists", async () => {
        await testPrisma.mediumExport.create({
            data: {
                projectId,
                nodeId: null,
                mediumPostId: "existing-post",
                mediumPostUrl: "https://medium.com/p/existing",
                publishStatus: "public",
                lastSyncedAt: new Date(),
                credentialId,
            },
        });

        const result = await MediumPublishController.publish({ projectId }, null);

        expect(result.alreadyPublished).toBe(true);
        expect(result.mediumPostId).toBe("existing-post");
        expect(result.mediumPostUrl).toBe("https://medium.com/p/existing");
        // Should not call Medium API
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("uses titleOverride when provided", async () => {
        mockFetch.mockResolvedValue(makeMediumPostResponse());

        await MediumPublishController.publish(
            { projectId, titleOverride: "Custom Title" },
            null
        );

        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.title).toBe("Custom Title");
    });

    it("rejects title over 100 characters", async () => {
        const longTitle = "A".repeat(101);
        await expect(
            MediumPublishController.publish(
                { projectId, titleOverride: longTitle },
                null
            )
        ).rejects.toThrow("Title exceeds 100 characters");
    });

    it("rejects more than 3 tags", async () => {
        await expect(
            MediumPublishController.publish(
                { projectId, tags: ["a", "b", "c", "d"] },
                null
            )
        ).rejects.toThrow("Maximum 3 tags");
    });

    it("throws when no Medium credential exists", async () => {
        await testPrisma.mediumCredential.deleteMany();

        await expect(
            MediumPublishController.publish({ projectId }, null)
        ).rejects.toThrow("Medium account not connected");
    });

    it("passes publishStatus and tags to Medium API", async () => {
        mockFetch.mockResolvedValue(makeMediumPostResponse());

        await MediumPublishController.publish(
            { projectId, publishStatus: "public", tags: ["fiction", "writing"] },
            null
        );

        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.publishStatus).toBe("public");
        expect(body.tags).toEqual(["fiction", "writing"]);
    });

    it("passes canonicalUrl to Medium API when provided", async () => {
        mockFetch.mockResolvedValue(makeMediumPostResponse());

        await MediumPublishController.publish(
            { projectId, canonicalUrl: "https://mysite.com/story" },
            null
        );

        const fetchCall = mockFetch.mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);
        expect(body.canonicalUrl).toBe("https://mysite.com/story");
    });

    it("throws when Medium API returns an error", async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            text: () => Promise.resolve("Unauthorized"),
            json: () => Promise.resolve({}),
        });

        await expect(
            MediumPublishController.publish({ projectId }, null)
        ).rejects.toThrow("Medium API error (401)");
    });

    it("tracks export for a specific nodeId", async () => {
        const chapter = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });

        mockFetch.mockResolvedValue(makeMediumPostResponse("node-post", "https://medium.com/p/node-post"));

        const result = await MediumPublishController.publish(
            { projectId, nodeId: chapter.id },
            null
        );

        expect(result.mediumPostId).toBe("node-post");

        const stored = await testPrisma.mediumExport.findFirst({
            where: { projectId, nodeId: chapter.id },
        });
        expect(stored).not.toBeNull();
        expect(stored!.nodeId).toBe(chapter.id);
    });
});
