import { describe, it, expect, vi, beforeEach } from "vitest";
import { StructureController } from "../lib/controllers/structure";
import { exportManuscript } from "../mcp/tools/export";
import { prisma } from "@/lib/db";

// Mock prisma
vi.mock("@/lib/db", () => {
    const mockPrisma = {
        $transaction: vi.fn((fn: (tx: any) => unknown) => fn(mockPrisma)),
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
            update: vi.fn(),
        },
    };
    return { prisma: mockPrisma };
});

describe("Scene Beats", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Validation (StructureController.writeSceneContent)", () => {
        const mockNode = { id: "scene-1", type: "SCENE", title: "Scene 1", projectId: "proj-1" };

        it("should accept content with valid beats", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({
                id: "v1", createdAt: new Date(), nodeId: "scene-1", wordCount: 10
            });
            (prisma.contentVersion.findMany as any).mockResolvedValue([]);

            const content = "<p>Some text.</p><!-- beat: This is a beat --> <p>More text.</p>";

            await expect(StructureController.writeSceneContent("scene-1", content)).resolves.not.toThrow();
        });

        it("should exclude beats from word count", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({
                id: "v1", createdAt: new Date(), nodeId: "scene-1", wordCount: 2
            });
            (prisma.contentVersion.findMany as any).mockResolvedValue([]);

            const content = "hello world<!-- beat: This beat has five words -->";

            await StructureController.writeSceneContent("scene-1", content);

            expect(prisma.contentVersion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        wordCount: 2, // only "hello world", not the beat content
                    }),
                })
            );
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

        it("should exclude beat annotations from word count", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({
                id: "v1", createdAt: new Date(), nodeId: "scene-1", wordCount: 4
            });
            (prisma.contentVersion.findMany as any).mockResolvedValue([]);

            const content = "<p>Some text.</p><!-- beat: This is a beat with many words --> <p>More text.</p>";

            await StructureController.writeSceneContent("scene-1", content);

            expect(prisma.contentVersion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        wordCount: 4, // Only "Some text. More text." — not beat words
                    }),
                })
            );
        });

        it("should exclude beat div annotations from word count (MCP path)", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({
                id: "v1", createdAt: new Date(), nodeId: "scene-1", wordCount: 2
            });
            (prisma.contentVersion.findMany as any).mockResolvedValue([]);

            const content = '<p>Hello world</p><div data-type="beat-annotation">This beat has five words</div>';

            await StructureController.writeSceneContent("scene-1", content);

            expect(prisma.contentVersion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        wordCount: 2, // only "Hello world", not the beat div content
                    }),
                })
            );
        });

        it("should accept content without beats", async () => {
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({ id: "v1", createdAt: new Date() });
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

            (prisma.contentVersion.findMany as any).mockResolvedValue([{
                nodeId: sceneId,
                content: "<p>Start.</p><!-- beat: ACTION: Chase --> <p>Middle.</p><!-- beat: EMOTION: Fear --> <p>End.</p>"
            }]);

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
            (prisma.contentVersion.findMany as any).mockResolvedValue([{
                nodeId: "s1",
                content: "<p>Text.</p><!-- beat: \nMulti-line\nBeat\n --> <p>More.</p>"
            }]);

            const markdown = await exportManuscript(projectId);
            expect(markdown).toContain("Text.");
            expect(markdown).toContain("More.");
            expect(markdown).not.toContain("Multi-line");
        });
    });

    describe("Parsing and Logic (StructureController)", () => {
        it("should parse content into blocks correctly", () => {
            const raw = "<p>Opening.</p><!-- beat: Action --> <p>Closing.</p>";
            const blocks = StructureController.parseSceneContent(raw);

            expect(blocks).toHaveLength(3);
            expect(blocks[0]).toEqual({ type: "CONTENT", content: "<p>Opening.</p>" });
            expect(blocks[1]).toEqual({ type: "BEAT", content: "Action" }); // My impl trims beat content inside? Let's check impl.
            // Ah, my impl does `beatComment.replace(/^<!-- beat:\s*/, "").replace(/\s*-->$/, "")`
            // So if raw is `<!-- beat: Action -->`, `beatContent` becomes `Action`.
            // But if there are trailing/leading spaces inside the comment, they might remain if regex doesn't catch them all or trims them.
            // My regex was `replace(/\s*-->$/, "")`. So it trims trailing spaces before `-->`.
            // `replace(/^<!-- beat:\s*/, "")`. It trims leading spaces after `beat:`.
            // So `Action` (with space before Action but handled by `\s*`) -> `Action`.
            // Wait, `<!-- beat: Action -->`. `^<!-- beat:\s*` matches `<!-- beat: ` (space).
            // So content is `Action `. Wait, `\s*-->$` matches ` -->`.
            // So `Action`. Correct.

            expect(blocks[2]).toEqual({ type: "CONTENT", content: " <p>Closing.</p>" });
        });

        it("should serialize blocks back to HTML string with beat comments", () => {
            const blocks = [
                { type: "CONTENT", content: "<p>Start</p>" },
                { type: "BEAT", content: "Middle Beat" },
                { type: "CONTENT", content: "<p>End</p>" }
            ] as any; // Cast to avoid TS issues if defining blocks manually in test without full type import

            const serialized = StructureController.serializeSceneContent(blocks);
            expect(serialized).toBe("<p>Start</p><!-- beat: Middle Beat --><p>End</p>");
        });

        it("should handle writeSceneContentFromBlocks", async () => {
            const mockNode = { id: "scene-blocks", type: "SCENE", title: "Blocks Test" };
            (prisma.structureNode.findUnique as any).mockResolvedValue(mockNode);
            (prisma.contentVersion.create as any).mockResolvedValue({ id: "v2", wordCount: 5, createdAt: new Date() });
            (prisma.contentVersion.findMany as any).mockResolvedValue([]);

            const blocks = [
                { type: "CONTENT", content: "Text" },
                { type: "BEAT", content: "Beat" }
            ];

            await StructureController.writeSceneContentFromBlocks("scene-blocks", blocks as any);

            expect(prisma.structureNode.findUnique).toHaveBeenCalledWith({ where: { id: "scene-blocks" }, select: expect.any(Object) });
            // Verify create was called with serialized content
            const expectedContent = "Text<!-- beat: Beat -->";
            expect(prisma.contentVersion.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    nodeId: "scene-blocks",
                    content: expectedContent
                })
            }));
        });
    });
});
