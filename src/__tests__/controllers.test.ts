import { describe, it, expect, beforeEach } from "vitest";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController, ConflictError } from "@/lib/controllers/structure";
import { computeContentHash } from "@/lib/offline/content-hash";
import { testPrisma } from "./setup";

// Note: The controllers use the global prisma instance. 
// In the vitest setup, we set process.env.DATABASE_URL
// so both the global prisma and testPrisma should hit the same test.db.

describe("Controller Integrity Tests", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({
            title: "Test Project",
            author: "Test Author",
            genre: "Test Genre"
        });
        projectId = project.id;
    });

    describe("ProjectsController", () => {
        it("should list projects with correct counts and names", async () => {
            // Create some data
            const _node = await StructureController.createNode({
                projectId,
                type: "SCENE",
                title: "Test Scene"
            });

            const result = await ProjectsController.listProjects();
            const project = result.projects.find((p: Record<string, unknown>) => p.id === projectId);

            expect(project).toBeDefined();
            expect(project?.title).toBe("Test Project");
            // These field names were recently fixed (structureNodes vs StructureNode)
            // If they are broken in the schema or controller, this will fail or return 0
            expect(project?.nodeCount).toBe(1);
        });

        it("should fetch a single project with correct field mapping", async () => {
            const project = await ProjectsController.getProject(projectId);
            expect(project.title).toBe("Test Project");
            expect(project.nodeCount).toBe(0);
        });
    });

    describe("StructureController", () => {
        it("should handle nested structure and word counts correctly", async () => {
            const chapter = await StructureController.createNode({
                projectId,
                type: "CHAPTER",
                title: "Chapter 1"
            });

            const scene = await StructureController.createNode({
                projectId,
                parentId: chapter.id,
                type: "SCENE",
                title: "Scene 1"
            });

            await StructureController.writeSceneContent(scene.id, "One two three words.");

            const outline = await StructureController.getOutline(projectId);
            expect(outline).toHaveLength(1);
            expect(outline[0].title).toBe("Chapter 1");
            expect(outline[0].children).toHaveLength(1);
            expect(outline[0].children[0].title).toBe("Scene 1");
            // Word count logic verification
            expect(outline[0].children[0].wordCount).toBe(4);
        });

        it("should create and retrieve annotations", async () => {
            const scene = await StructureController.createNode({
                projectId,
                type: "SCENE",
                title: "Scene for Annotation"
            });

            const annotation = await StructureController.addAnnotation(
                scene.id,
                "Fix this part",
                JSON.stringify({ from: 0, to: 5 }),
                "Words"
            );

            expect(annotation.content).toBe("Fix this part");
            expect(annotation.nodeId).toBe(scene.id);

            const openRels = await StructureController.getOpenAnnotations(projectId);
            expect(openRels).toHaveLength(1);
            expect(openRels[0].content).toBe("Fix this part");
            expect(openRels[0].nodeTitle).toBe("Scene for Annotation");
        });

        describe("writeSceneContent optimistic locking", () => {
            let scene: { id: string };

            beforeEach(async () => {
                scene = await StructureController.createNode({
                    projectId,
                    type: "SCENE",
                    title: "Lock Test Scene",
                });
            });

            it("accepts write with no contentHash (backward compat / first write)", async () => {
                await expect(
                    StructureController.writeSceneContent(scene.id, "<p>Initial</p>")
                ).resolves.not.toThrow();
            });

            it("accepts any hash when no previous version exists (first write)", async () => {
                // createNode creates an initial empty ContentVersion — delete it to simulate
                // the edge case where a node has no prior versions (e.g. direct DB inserts).
                await testPrisma.contentVersion.deleteMany({ where: { nodeId: scene.id } });
                const arbitraryHash = "a".repeat(64);
                await expect(
                    StructureController.writeSceneContent(scene.id, "<p>First write</p>", arbitraryHash)
                ).resolves.not.toThrow();
            });

            it("accepts write when contentHash matches server latest", async () => {
                const initialContent = "<p>Initial</p>";
                await StructureController.writeSceneContent(scene.id, initialContent);
                const hash = await computeContentHash(initialContent);
                await expect(
                    StructureController.writeSceneContent(scene.id, "<p>Updated</p>", hash)
                ).resolves.not.toThrow();
            });

            it("throws ConflictError when contentHash is stale", async () => {
                await StructureController.writeSceneContent(scene.id, "<p>Server version</p>");
                const staleHash = await computeContentHash("<p>Old client version</p>");
                await expect(
                    StructureController.writeSceneContent(scene.id, "<p>Client write</p>", staleHash)
                ).rejects.toThrow(ConflictError);
            });

            it("ConflictError has correct name property", async () => {
                await StructureController.writeSceneContent(scene.id, "<p>Server version</p>");
                const staleHash = await computeContentHash("<p>Old client version</p>");
                try {
                    await StructureController.writeSceneContent(scene.id, "<p>Client write</p>", staleHash);
                    throw new Error("Expected ConflictError");
                } catch (err) {
                    expect(err instanceof Error && err.name).toBe("ConflictError");
                }
            });
        });
    });
});
