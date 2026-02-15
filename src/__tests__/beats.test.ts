import { describe, it, expect, vi, beforeEach } from "vitest";
import { StructureController } from "../lib/controllers/structure";
import { exportManuscript } from "../mcp/tools/export";
import { prisma } from "@/lib/db";

// Mock prisma
vi.mock("@/lib/db", () => ({
    prisma: {
        structureNode: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        contentVersion: {
            create: vi.fn(),
            findMany: vi.fn(),
            deleteMany: vi.fn(),
            findFirst: vi.fn(),
        },
        project: {
            findUnique: vi.fn(),
        },
    },
}));

describe("Scene Beats", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Validation (StructureController.writeSceneContent)", () => {
        const mockNode = { id: "scene-1", type: "SCENE", title: "Scene 1" };

        it("should accept content with valid beats", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({
                id: "v1", createdAt: new Date(), nodeId: "scene-1", wordCount: 10
            });
            (prisma.contentVersion.findMany as any).mockResolvedValue([]);

            const content = "<p>Some text.</p><!-- beat: This is a beat --> <p>More text.</p>";

            await expect(StructureController.writeSceneContent("scene-1", content)).resolves.not.toThrow();
        });

        it("should reject unclosed beat tags", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);

            const content = "<p>Text</p><!-- beat: unclosed beat <p>More text</p>";

            await expect(StructureController.writeSceneContent("scene-1", content))
                .rejects.toThrow(/Unclosed beat annotation/);
        });

        it("should reject nested comments within beats", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);

            const content = "<!-- beat: This has <!-- another comment --> inside -->";

            await expect(StructureController.writeSceneContent("scene-1", content))
                .rejects.toThrow(/Nested comments in beats are not allowed/);
        });

        it("should accept content without beats", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({});
            (prisma.contentVersion.findMany as any).mockResolvedValue([]);

            const content = "<p>Just normal text.</p>";

            await expect(StructureController.writeSceneContent("scene-1", content)).resolves.not.toThrow();
        });
    });

    describe("Export Stripping (exportManuscript)", () => {
        it("should strip beats from the exported markdown", async () => {
            const projectId = "proj-1";
            const sceneId = "scene-1";

            (prisma.project.findUnique as any).mockResolvedValue({
                id: projectId, title: "Test Project", author: "Author"
            });

            (prisma.structureNode.findMany as any).mockResolvedValue([
                { id: "scene-1", type: "SCENE", title: "Scene 1", orderIndex: 0, parentId: null }
            ]);

            (prisma.contentVersion.findFirst as any).mockResolvedValue({
                nodeId: sceneId,
                content: "<p>Start.</p><!-- beat: ACTION: Chase --> <p>Middle.</p><!-- beat: EMOTION: Fear --> <p>End.</p>"
            });

            const markdown = await exportManuscript(projectId);

            expect(markdown).toContain("Start.");
            expect(markdown).toContain("Middle.");
            expect(markdown).toContain("End.");
            expect(markdown).not.toContain("ACTION: Chase");
            expect(markdown).not.toContain("EMOTION: Fear");
            expect(markdown).not.toContain("beat:");
        });

        it("should handle beats across lines if allowed by regex", async () => {
            const projectId = "proj-1";
            (prisma.project.findUnique as any).mockResolvedValue({ id: projectId, title: "Test" });
            (prisma.structureNode.findMany as any).mockResolvedValue([
                { id: "s1", type: "SCENE", title: "S1", orderIndex: 0 }
            ]);
            (prisma.contentVersion.findFirst as any).mockResolvedValue({
                nodeId: "s1",
                content: "<p>Text.</p><!-- beat: \nMulti-line\nBeat\n --> <p>More.</p>"
            });

            const markdown = await exportManuscript(projectId);
            expect(markdown).toContain("Text.");
            expect(markdown).toContain("More.");
            expect(markdown).not.toContain("Multi-line");
        });
    });
});
