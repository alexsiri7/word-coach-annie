import { describe, it, expect, beforeEach } from "vitest";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
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
            const node = await StructureController.createNode({
                projectId,
                type: "SCENE",
                title: "Test Scene"
            });

            const result = await ProjectsController.listProjects();
            const project = result.projects.find((p: any) => p.id === projectId);

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
    });
});
