import { describe, it, expect, beforeEach } from "vitest";
import { StructureController } from "@/lib/controllers/structure";
import { ProjectsController } from "@/lib/controllers/projects";
import { insertBeat } from "@/mcp/tools/structure";
import { computeContentHash, StaleWriteError } from "@/mcp/content-hash";

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

            it("getOpenAnnotations includes selectedText in returned shape", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.addAnnotation(scene.id, "With text", "", "some selected passage");
                await StructureController.addAnnotation(scene.id, "Without text");

                const open = await StructureController.getOpenAnnotations(projectId);
                expect(open).toHaveLength(2);

                const withText = open.find((a) => a.content === "With text");
                expect(withText).toBeDefined();
                expect(withText!.selectedText).toBe("some selected passage");

                const withoutText = open.find((a) => a.content === "Without text");
                expect(withoutText).toBeDefined();
                expect(withoutText!.selectedText).toBeNull();
            });
        });

        describe("insertBeat", () => {
            it("inserts beat after given index", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(
                    scene.id,
                    "<p>Before</p><!-- beat: Existing --><p>After</p>"
                );

                const result = await insertBeat(scene.id, 0, "New beat");
                expect(result.nodeId).toBe(scene.id);

                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(4);
                expect(read.blocks[0]).toEqual({ type: "CONTENT", content: "<p>Before</p>" });
                expect(read.blocks[1]).toEqual({ type: "BEAT", content: "New beat" });
                expect(read.blocks[2]).toEqual({ type: "BEAT", content: "Existing" });
                expect(read.blocks[3]).toEqual({ type: "CONTENT", content: "<p>After</p>" });
            });

            it("inserts beat at index -1 (before all blocks)", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>Existing</p>");

                await insertBeat(scene.id, -1, "First beat");

                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(2);
                expect(read.blocks[0]).toEqual({ type: "BEAT", content: "First beat" });
                expect(read.blocks[1]).toEqual({ type: "CONTENT", content: "<p>Existing</p>" });
            });

            it("throws if afterParagraphIndex is out of range", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>Only</p>");

                await expect(insertBeat(scene.id, 99, "Bad")).rejects.toThrow("out of range");
                await expect(insertBeat(scene.id, -2, "Bad")).rejects.toThrow("out of range");
            });

            it("shifts existing blocks correctly", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContentFromBlocks(scene.id, [
                    { type: "CONTENT", content: "<p>A</p>" },
                    { type: "BEAT", content: "Existing beat" },
                    { type: "CONTENT", content: "<p>C</p>" },
                ]);

                await insertBeat(scene.id, 1, "Between beat and C");

                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(4);
                expect(read.blocks[0]).toEqual({ type: "CONTENT", content: "<p>A</p>" });
                expect(read.blocks[1]).toEqual({ type: "BEAT", content: "Existing beat" });
                expect(read.blocks[2]).toEqual({ type: "BEAT", content: "Between beat and C" });
                expect(read.blocks[3]).toEqual({ type: "CONTENT", content: "<p>C</p>" });
            });

            it("returns scene metadata", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>Hello</p>");

                const result = await insertBeat(scene.id, 0, "A beat");
                expect(result.nodeId).toBe(scene.id);
                expect(result.versionId).toBeDefined();
                expect(result.wordCount).toBeDefined();
                expect(result.createdAt).toBeDefined();
            });

            it("rejects insert when sceneContentHash is stale", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>Hello</p>");

                const staleHash = computeContentHash("stale-content");
                await expect(insertBeat(scene.id, 0, "New beat", staleHash)).rejects.toThrow(StaleWriteError);
            });

            it("accepts insert when sceneContentHash matches current content", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>Hello</p>");

                const current = await StructureController.readSceneContent(scene.id);
                const hash = computeContentHash(current.content);
                await expect(insertBeat(scene.id, 0, "New beat", hash)).resolves.toBeDefined();
            });

            it("splits single CONTENT block when inserting after first paragraph", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>P1</p><p>P2</p><p>P3</p>");

                await insertBeat(scene.id, 0, "After P1");

                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(3);
                expect(read.blocks[0]).toEqual({ type: "CONTENT", content: "<p>P1</p>" });
                expect(read.blocks[1]).toEqual({ type: "BEAT", content: "After P1" });
                expect(read.blocks[2]).toEqual({ type: "CONTENT", content: "<p>P2</p><p>P3</p>" });
            });

            it("splits single CONTENT block when inserting after middle paragraph", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>P1</p><p>P2</p><p>P3</p>");

                await insertBeat(scene.id, 1, "After P2");

                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(3);
                expect(read.blocks[0]).toEqual({ type: "CONTENT", content: "<p>P1</p><p>P2</p>" });
                expect(read.blocks[1]).toEqual({ type: "BEAT", content: "After P2" });
                expect(read.blocks[2]).toEqual({ type: "CONTENT", content: "<p>P3</p>" });
            });

            it("does not create empty CONTENT block when inserting after last paragraph", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>P1</p><p>P2</p><p>P3</p>");

                await insertBeat(scene.id, 2, "After last");

                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(2);
                expect(read.blocks[0]).toEqual({ type: "CONTENT", content: "<p>P1</p><p>P2</p><p>P3</p>" });
                expect(read.blocks[1]).toEqual({ type: "BEAT", content: "After last" });
            });

            it("treats non-<p> CONTENT block as a single atomic paragraph", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContentFromBlocks(scene.id, [
                    { type: "CONTENT", content: "raw text without p tags" },
                ]);
                await insertBeat(scene.id, 0, "After raw");
                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(2);
                expect(read.blocks[0]).toEqual({ type: "CONTENT", content: "raw text without p tags" });
                expect(read.blocks[1]).toEqual({ type: "BEAT", content: "After raw" });
            });

            it("splits block containing attributed <p> tags correctly", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(
                    scene.id,
                    '<p class="a">First</p><p class="b">Second</p>',
                );
                await insertBeat(scene.id, 0, "Mid beat");
                const read = await StructureController.readSceneContent(scene.id);
                expect(read.blocks).toHaveLength(3);
                expect(read.blocks[0]).toEqual({ type: "CONTENT", content: '<p class="a">First</p>' });
                expect(read.blocks[1]).toEqual({ type: "BEAT", content: "Mid beat" });
                expect(read.blocks[2]).toEqual({ type: "CONTENT", content: '<p class="b">Second</p>' });
            });

            it("out-of-range uses total paragraph count not block count", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                await StructureController.writeSceneContent(scene.id, "<p>A</p><p>B</p><p>C</p>");

                await expect(insertBeat(scene.id, 3, "Bad")).rejects.toThrow("out of range");
                await expect(insertBeat(scene.id, -2, "Bad")).rejects.toThrow("out of range");
            });
        });

        describe("writeSceneContentFromBlocks", () => {
            it("serializes blocks and writes content", async () => {
                const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
                const result = await StructureController.writeSceneContentFromBlocks(scene.id, [
                    { type: "CONTENT", content: "<p>Hello</p>" },
                    { type: "BEAT", content: "Action beat" },
                    { type: "CONTENT", content: "<p>World</p>" },
                ]);
                expect(result.wordCount).toBe(2); // "Hello" + "World"
                const read = await StructureController.readSceneContent(scene.id);
                expect(read.content).toBe("<p>Hello</p><!-- beat: Action beat --><p>World</p>");
            });
        });

        describe("batchCreateNodes", () => {
            it("creates multiple nodes in order", async () => {
                const result = await StructureController.batchCreateNodes(projectId, [
                    { type: "CHAPTER", title: "Ch 1" },
                    { type: "CHAPTER", title: "Ch 2" },
                    { type: "CHAPTER", title: "Ch 3" },
                ]);
                expect(result.totalCreated).toBe(3);
                expect(result.totalErrors).toBe(0);
                expect(result.created[0].title).toBe("Ch 1");
                expect(result.created[2].title).toBe("Ch 3");
            });

            it("reports errors for invalid nodes without stopping batch", async () => {
                const result = await StructureController.batchCreateNodes(projectId, [
                    { type: "CHAPTER", title: "Valid" },
                    { type: "INVALID", title: "Bad type" },
                    { type: "SCENE", title: "Also valid" },
                ]);
                expect(result.totalCreated).toBe(2);
                expect(result.totalErrors).toBe(1);
                expect(result.errors[0].error).toContain("type must be one of");
            });

            it("throws for empty array", async () => {
                await expect(
                    StructureController.batchCreateNodes(projectId, [])
                ).rejects.toThrow("nodes array must not be empty");
            });

            it("throws for non-existent project", async () => {
                await expect(
                    StructureController.batchCreateNodes("bad-id", [{ type: "CHAPTER", title: "X" }])
                ).rejects.toThrow("Project not found");
            });
        });

        describe("batchUpdateNodes", () => {
            it("updates multiple nodes", async () => {
                const ch1 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
                const ch2 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 2" });
                const result = await StructureController.batchUpdateNodes([
                    { nodeId: ch1.id, title: "Updated 1" },
                    { nodeId: ch2.id, title: "Updated 2" },
                ]);
                expect(result.totalUpdated).toBe(2);
                expect(result.totalErrors).toBe(0);
            });

            it("reports errors for bad updates", async () => {
                const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
                const result = await StructureController.batchUpdateNodes([
                    { nodeId: ch.id, title: "Good" },
                    { nodeId: "bad-id", title: "Missing" },
                ]);
                expect(result.totalUpdated).toBe(1);
                expect(result.totalErrors).toBe(1);
            });

            it("throws for empty array", async () => {
                await expect(
                    StructureController.batchUpdateNodes([])
                ).rejects.toThrow("updates array must not be empty");
            });
        });

        describe("batchDeleteNodes", () => {
            it("deletes multiple nodes", async () => {
                const ch1 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
                const ch2 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 2" });
                const result = await StructureController.batchDeleteNodes([ch1.id, ch2.id]);
                expect(result.totalDeleted).toBe(2);
                expect(result.totalErrors).toBe(0);
                const outline = await StructureController.getOutline(projectId);
                expect(outline).toHaveLength(0);
            });

            it("reports errors for non-existent nodes", async () => {
                const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
                const result = await StructureController.batchDeleteNodes([ch.id, "bad-id"]);
                expect(result.totalDeleted).toBe(1);
                expect(result.totalErrors).toBe(1);
            });

            it("throws for empty array", async () => {
                await expect(
                    StructureController.batchDeleteNodes([])
                ).rejects.toThrow("nodeIds array must not be empty");
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
