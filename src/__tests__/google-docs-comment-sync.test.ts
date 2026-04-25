import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock GoogleDocsApi
vi.mock("@/lib/google-api", () => ({
    GoogleDocsApi: {
        fetchComments: vi.fn(),
    },
}));

import { GoogleDocsCommentSync } from "@/lib/export/google-docs-comment-sync";
import { GoogleDocsApi } from "@/lib/google-api";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { prisma } from "@/lib/db";

describe("GoogleDocsCommentSync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("syncComments", () => {
        it("throws when no Google Doc export exists for project", async () => {
            const project = await ProjectsController.createProject({ title: "No Export" });
            await expect(
                GoogleDocsCommentSync.syncComments(project.id)
            ).rejects.toThrow("No Google Doc export found");
        });

        it("imports new comment as annotation on the matching scene", async () => {
            const project = await ProjectsController.createProject({ title: "Comment Test" });
            const chapter = await StructureController.createNode({
                projectId: project.id,
                type: "CHAPTER",
                title: "Chapter 1",
            });
            const scene = await StructureController.createNode({
                projectId: project.id,
                type: "SCENE",
                title: "Scene 1",
                parentId: chapter.id,
            });
            // Save scene content
            await prisma.contentVersion.create({
                data: {
                    nodeId: scene.id,
                    content: "Once upon a time, a hero was born.",
                    wordCount: 8,
                },
            });

            // Create a GoogleDocExport for this project
            const exportRecord = await prisma.googleDocExport.create({
                data: {
                    projectId: project.id,
                    exportMode: "STORY_READER",
                    googleDocId: "doc-abc",
                    googleDocUrl: "https://docs.google.com/document/d/doc-abc/edit",
                    lastSyncedAt: new Date(),
                },
            });

            vi.mocked(GoogleDocsApi.fetchComments).mockResolvedValue([
                {
                    id: "comment-1",
                    content: "Great opening!",
                    quotedFileContent: { value: "a hero was born" },
                    author: { displayName: "Reviewer" },
                    resolved: false,
                    replies: [],
                },
            ]);

            const result = await GoogleDocsCommentSync.syncComments(project.id);

            expect(result.imported).toBe(1);
            expect(result.skipped).toBe(0);
            expect(result.unresolvable).toBe(0);
            expect(GoogleDocsApi.fetchComments).toHaveBeenCalledWith("doc-abc", undefined);

            // Verify annotation was created
            const annotations = await prisma.annotation.findMany({
                where: { nodeId: scene.id },
            });
            expect(annotations).toHaveLength(1);
            expect(annotations[0].content).toContain("Reviewer");
            expect(annotations[0].content).toContain("Great opening!");
            expect(annotations[0].externalId).toBe(`gdoc:doc-abc:comment-1`);
            expect(annotations[0].selectedText).toBe("a hero was born");
            expect(annotations[0].resolved).toBe(false);

            // Verify lastCommentSyncAt was updated
            const updatedExport = await prisma.googleDocExport.findUnique({
                where: { id: exportRecord.id },
            });
            expect(updatedExport?.lastCommentSyncAt).not.toBeNull();
        });

        it("skips already-imported comments on second sync", async () => {
            const project = await ProjectsController.createProject({ title: "Dedup Test" });
            const chapter = await StructureController.createNode({
                projectId: project.id,
                type: "CHAPTER",
                title: "Chapter 1",
            });
            const scene = await StructureController.createNode({
                projectId: project.id,
                type: "SCENE",
                title: "Scene 1",
                parentId: chapter.id,
            });
            await prisma.contentVersion.create({
                data: {
                    nodeId: scene.id,
                    content: "The dragon roared.",
                    wordCount: 3,
                },
            });
            await prisma.googleDocExport.create({
                data: {
                    projectId: project.id,
                    exportMode: "STORY_READER",
                    googleDocId: "doc-dedup",
                    googleDocUrl: "https://docs.google.com/document/d/doc-dedup/edit",
                    lastSyncedAt: new Date(),
                },
            });

            const mockComment = {
                id: "comment-x",
                content: "Dramatic!",
                quotedFileContent: { value: "dragon roared" },
                author: { displayName: "Alice" },
                resolved: false,
                replies: [],
            };
            vi.mocked(GoogleDocsApi.fetchComments).mockResolvedValue([mockComment]);

            // First sync
            const first = await GoogleDocsCommentSync.syncComments(project.id);
            expect(first.imported).toBe(1);

            // Second sync — same comment, should be skipped
            const second = await GoogleDocsCommentSync.syncComments(project.id);
            expect(second.imported).toBe(0);
            expect(second.skipped).toBe(1);
        });

        it("counts comment as unresolvable when anchor text not found in any scene", async () => {
            const project = await ProjectsController.createProject({ title: "Unresolvable" });
            const chapter = await StructureController.createNode({
                projectId: project.id,
                type: "CHAPTER",
                title: "Ch 1",
            });
            const scene = await StructureController.createNode({
                projectId: project.id,
                type: "SCENE",
                title: "S1",
                parentId: chapter.id,
            });
            await prisma.contentVersion.create({
                data: {
                    nodeId: scene.id,
                    content: "Short content here.",
                    wordCount: 3,
                },
            });
            await prisma.googleDocExport.create({
                data: {
                    projectId: project.id,
                    exportMode: "STORY_READER",
                    googleDocId: "doc-unres",
                    googleDocUrl: "https://docs.google.com/document/d/doc-unres/edit",
                    lastSyncedAt: new Date(),
                },
            });

            vi.mocked(GoogleDocsApi.fetchComments).mockResolvedValue([
                {
                    id: "comment-gone",
                    content: "Where did this come from?",
                    quotedFileContent: { value: "text that was deleted from the doc" },
                    author: { displayName: "Bob" },
                    resolved: false,
                    replies: [],
                },
            ]);

            const result = await GoogleDocsCommentSync.syncComments(project.id);
            expect(result.imported).toBe(0);
            expect(result.unresolvable).toBe(1);
        });

        it("includes replies in annotation content", async () => {
            const project = await ProjectsController.createProject({ title: "Replies Test" });
            const chapter = await StructureController.createNode({
                projectId: project.id,
                type: "CHAPTER",
                title: "Ch 1",
            });
            const scene = await StructureController.createNode({
                projectId: project.id,
                type: "SCENE",
                title: "S1",
                parentId: chapter.id,
            });
            await prisma.contentVersion.create({
                data: {
                    nodeId: scene.id,
                    content: "The castle stood tall.",
                    wordCount: 4,
                },
            });
            await prisma.googleDocExport.create({
                data: {
                    projectId: project.id,
                    exportMode: "STORY_READER",
                    googleDocId: "doc-replies",
                    googleDocUrl: "https://docs.google.com/document/d/doc-replies/edit",
                    lastSyncedAt: new Date(),
                },
            });

            vi.mocked(GoogleDocsApi.fetchComments).mockResolvedValue([
                {
                    id: "c1",
                    content: "Needs more description",
                    quotedFileContent: { value: "castle stood" },
                    author: { displayName: "Editor" },
                    resolved: false,
                    replies: [
                        {
                            content: "Agreed, let me revise",
                            author: { displayName: "Author" },
                        },
                    ],
                },
            ]);

            await GoogleDocsCommentSync.syncComments(project.id);

            const annotations = await prisma.annotation.findMany({
                where: { nodeId: scene.id },
            });
            expect(annotations[0].content).toContain("Editor");
            expect(annotations[0].content).toContain("Needs more description");
            expect(annotations[0].content).toContain("Author");
            expect(annotations[0].content).toContain("Agreed, let me revise");
        });
    });

    describe("getExportInfo", () => {
        it("returns export records for a project", async () => {
            const project = await ProjectsController.createProject({ title: "Info Test" });
            await prisma.googleDocExport.create({
                data: {
                    projectId: project.id,
                    exportMode: "STORY_READER",
                    googleDocId: "doc-info",
                    googleDocUrl: "https://docs.google.com/document/d/doc-info/edit",
                    lastSyncedAt: new Date(),
                },
            });

            const exports = await GoogleDocsCommentSync.getExportInfo(project.id);
            expect(exports).toHaveLength(1);
            expect(exports[0].exportMode).toBe("STORY_READER");
            expect(exports[0].googleDocUrl).toContain("doc-info");
            expect(exports[0].lastCommentSyncAt).toBeNull();
        });
    });
});
