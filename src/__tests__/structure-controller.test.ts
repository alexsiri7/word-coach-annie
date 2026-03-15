import { describe, it, expect, beforeEach } from "vitest";
import { StructureController } from "@/lib/controllers/structure";
import { ProjectsController } from "@/lib/controllers/projects";

describe("StructureController", () => {
    describe("parseSceneContent", () => {
        it("parses plain content with no beats", () => {
            const blocks = StructureController.parseSceneContent("<p>Hello world</p>");
            expect(blocks).toHaveLength(1);
            expect(blocks[0]).toEqual({ type: "CONTENT", content: "<p>Hello world</p>" });
        });

        it("parses content with beats", () => {
            const content = "<p>Before</p><!-- beat: Action beat --><p>After</p>";
            const blocks = StructureController.parseSceneContent(content);
            expect(blocks).toHaveLength(3);
            expect(blocks[0]).toEqual({ type: "CONTENT", content: "<p>Before</p>" });
            expect(blocks[1]).toEqual({ type: "BEAT", content: "Action beat" });
            expect(blocks[2]).toEqual({ type: "CONTENT", content: "<p>After</p>" });
        });

        it("parses multiple beats", () => {
            const content = "<!-- beat: Beat 1 -->text<!-- beat: Beat 2 -->";
            const blocks = StructureController.parseSceneContent(content);
            expect(blocks).toHaveLength(3);
            expect(blocks[0].type).toBe("BEAT");
            expect(blocks[1].type).toBe("CONTENT");
            expect(blocks[2].type).toBe("BEAT");
        });

        it("handles empty content", () => {
            const blocks = StructureController.parseSceneContent("");
            expect(blocks).toHaveLength(0);
        });
    });

    describe("serializeSceneContent", () => {
        it("serializes blocks back to string", () => {
            const blocks = [
                { type: "CONTENT" as const, content: "<p>Hello</p>" },
                { type: "BEAT" as const, content: "Action beat" },
                { type: "CONTENT" as const, content: "<p>World</p>" }
            ];
            const result = StructureController.serializeSceneContent(blocks);
            expect(result).toBe("<p>Hello</p><!-- beat: Action beat --><p>World</p>");
        });

        it("roundtrips with parseSceneContent", () => {
            const original = "<p>Before</p><!-- beat: Action --><p>After</p>";
            const blocks = StructureController.parseSceneContent(original);
            const serialized = StructureController.serializeSceneContent(blocks);
            expect(serialized).toBe(original);
        });
    });

    describe("controller methods with database", () => {
        let projectId: string;

        beforeEach(async () => {
            const project = await ProjectsController.createProject({ title: "Test" });
            projectId = project.id;
        });

        describe("createNode", () => {
            it("creates a chapter with correct orderIndex", async () => {
                const ch1 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
                const ch2 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 2" });
                expect(ch1.orderIndex).toBe(0);
                expect(ch2.orderIndex).toBe(1);
            });

            it("inserts node at specific position", async () => {
                const _ch1 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
                const _ch3 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 3" });
                const ch2 = await StructureController.createNode({
                    projectId, type: "CHAPTER", title: "Ch 2", insertAfterIndex: 0
                });
                expect(ch2.orderIndex).toBe(1);

                const outline = await StructureController.getOutline(projectId);
                expect(outline[0].title).toBe("Ch 1");
                expect(outline[1].title).toBe("Ch 2");
                expect(outline[2].title).toBe("Ch 3");
            });

            it("creates scene with initial empty content version", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                const content = await StructureController.readSceneContent(scene.id);
                expect(content.content).toBe("");
                expect(content.wordCount).toBe(0);
            });

            it("throws for invalid type", async () => {
                await expect(
                    StructureController.createNode({ projectId, type: "INVALID", title: "X" })
                ).rejects.toThrow("type must be one of");
            });

            it("throws for invalid status", async () => {
                await expect(
                    StructureController.createNode({ projectId, type: "SCENE", title: "X", status: "BAD" })
                ).rejects.toThrow("status must be one of");
            });

            it("throws for non-existent project", async () => {
                await expect(
                    StructureController.createNode({ projectId: "bad", type: "SCENE", title: "X" })
                ).rejects.toThrow("Project not found");
            });

            it("throws for non-existent parent", async () => {
                await expect(
                    StructureController.createNode({ projectId, type: "SCENE", title: "X", parentId: "bad" })
                ).rejects.toThrow("Parent node not found");
            });
        });

        describe("updateNode", () => {
            it("updates title and status", async () => {
                const node = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                const updated = await StructureController.updateNode(node.id, {
                    title: "Updated", status: "DRAFT"
                });
                expect(updated.title).toBe("Updated");
                expect(updated.status).toBe("DRAFT");
            });

            it("throws for self-referencing parent", async () => {
                const node = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
                await expect(
                    StructureController.updateNode(node.id, { parentId: node.id })
                ).rejects.toThrow("cannot be its own parent");
            });

            it("throws for non-existent node", async () => {
                await expect(
                    StructureController.updateNode("bad", { title: "X" })
                ).rejects.toThrow("Node not found");
            });

            it("throws for no fields", async () => {
                const node = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
                await expect(
                    StructureController.updateNode(node.id, {})
                ).rejects.toThrow("No fields to update");
            });

            it("throws for invalid status", async () => {
                const node = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
                await expect(
                    StructureController.updateNode(node.id, { status: "INVALID" })
                ).rejects.toThrow("status must be one of");
            });
        });

        describe("deleteNode", () => {
            it("deletes node and reindexes siblings", async () => {
                const _ch1 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
                const ch2 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 2" });
                const _ch3 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 3" });

                await StructureController.deleteNode(ch2.id);

                const outline = await StructureController.getOutline(projectId);
                expect(outline).toHaveLength(2);
                expect(outline[0].title).toBe("Ch 1");
                expect(outline[0].orderIndex).toBe(0);
                expect(outline[1].title).toBe("Ch 3");
                expect(outline[1].orderIndex).toBe(1);
            });

            it("throws for non-existent node", async () => {
                await expect(StructureController.deleteNode("bad")).rejects.toThrow("Node not found");
            });
        });

        describe("writeSceneContent", () => {
            it("writes content and calculates word count", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                const result = await StructureController.writeSceneContent(scene.id, "Hello world foo");
                expect(result.wordCount).toBe(3);
            });

            it("excludes beats from word count", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                const result = await StructureController.writeSceneContent(
                    scene.id,
                    "Hello world <!-- beat: This beat text is not counted --> more text here"
                );
                expect(result.wordCount).toBe(5); // "Hello world" + "more text here"
            });

            it("throws for non-SCENE node", async () => {
                const chapter = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
                await expect(
                    StructureController.writeSceneContent(chapter.id, "content")
                ).rejects.toThrow("Content can only be written to SCENE nodes");
            });

            it("throws for malformed beat content", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await expect(
                    StructureController.writeSceneContent(scene.id, "<!-- beat: unclosed beat")
                ).rejects.toThrow("Malformed scene content");
            });
        });

        describe("readSceneContent", () => {
            it("reads content with blocks and annotations", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>Hello</p><!-- beat: Action --><p>World</p>");
                await StructureController.addAnnotation(scene.id, "Fix this");

                const result = await StructureController.readSceneContent(scene.id);
                expect(result.blocks).toHaveLength(3);
                expect(result.annotations).toHaveLength(1);
                expect(result.annotations[0].content).toBe("Fix this");
            });

            it("throws for non-existent node", async () => {
                await expect(StructureController.readSceneContent("bad")).rejects.toThrow("Node not found");
            });
        });

        describe("getSceneVersions", () => {
            it("returns version history", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "V1");
                await StructureController.writeSceneContent(scene.id, "V2");

                const result = await StructureController.getSceneVersions(scene.id);
                expect(result.versions.length).toBeGreaterThanOrEqual(2);
                expect(result.title).toBe("S1");
            });

            it("throws for non-existent node", async () => {
                await expect(StructureController.getSceneVersions("bad")).rejects.toThrow("Node not found");
            });
        });

        describe("restoreSceneVersion", () => {
            it("restores a previous version", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "Original content");
                const versions = await StructureController.getSceneVersions(scene.id);
                const originalId = versions.versions[0].id;

                await StructureController.writeSceneContent(scene.id, "Changed content");
                const result = await StructureController.restoreSceneVersion(scene.id, originalId);
                expect(result.restoredFromVersionId).toBe(originalId);

                const content = await StructureController.readSceneContent(scene.id);
                expect(content.content).toBe("Original content");
            });

            it("throws for non-existent version", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await expect(
                    StructureController.restoreSceneVersion(scene.id, "bad-version")
                ).rejects.toThrow("Version not found");
            });
        });

        describe("annotations", () => {
            it("adds annotation with range and selectedText", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                const ann = await StructureController.addAnnotation(
                    scene.id, "Note", JSON.stringify({ from: 0, to: 5 }), "Hello"
                );
                expect(ann.content).toBe("Note");
                expect(ann.selectedText).toBe("Hello");
            });

            it("throws for empty annotation content", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await expect(
                    StructureController.addAnnotation(scene.id, "")
                ).rejects.toThrow("Content is required");
            });

            it("resolves and unresolves annotations", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                const ann = await StructureController.addAnnotation(scene.id, "Note");

                const resolved = await StructureController.resolveAnnotation(ann.id, true);
                expect(resolved.resolved).toBe(true);

                const unresolved = await StructureController.resolveAnnotation(ann.id, false);
                expect(unresolved.resolved).toBe(false);
            });

            it("getOpenAnnotations filters by project", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.addAnnotation(scene.id, "Open note");

                const p2 = await ProjectsController.createProject({ title: "Other" });
                const s2 = await StructureController.createNode({ projectId: p2.id, type: "SCENE", title: "S2" });
                await StructureController.addAnnotation(s2.id, "Other note");

                const open = await StructureController.getOpenAnnotations(projectId);
                expect(open).toHaveLength(1);
                expect(open[0].content).toBe("Open note");

                const all = await StructureController.getOpenAnnotations();
                expect(all).toHaveLength(2);
            });
        });

        describe("getOutline", () => {
            it("throws for non-existent project", async () => {
                await expect(StructureController.getOutline("bad")).rejects.toThrow("Project not found");
            });

            it("includes word count for scenes", async () => {
                const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
                const scene = await StructureController.createNode({
                    projectId, type: "SCENE", title: "S1", parentId: ch.id
                });
                await StructureController.writeSceneContent(scene.id, "One two three");

                const outline = await StructureController.getOutline(projectId);
                expect(outline[0].children[0].wordCount).toBe(3);
            });
        });
    });
});
