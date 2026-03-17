import { describe, it, expect, beforeEach } from "vitest";
import { exportProjectStructure } from "@/lib/export-structure";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { testPrisma } from "./setup";

describe("exportProjectStructure", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await ProjectsController.createProject({
      title: "Test Novel",
      author: "Author",
      genre: "Fantasy",
      synopsis: "A test story",
    });
    projectId = project.id;
  });

  it("exports empty project with schema version", async () => {
    const result = await exportProjectStructure(projectId);
    expect(result.schemaVersion).toBe("1.0");
    expect(result.exportedAt).toBeTruthy();
    expect(result.project.title).toBe("Test Novel");
    expect(result.project.author).toBe("Author");
    expect(result.project.wordCount).toBe(0);
    expect(result.structure).toEqual([]);
  });

  it("exports flat chapters without parts", async () => {
    const ch1 = await StructureController.createNode({
      projectId,
      type: "CHAPTER",
      title: "Chapter One",
    });
    const ch2 = await StructureController.createNode({
      projectId,
      type: "CHAPTER",
      title: "Chapter Two",
    });

    const result = await exportProjectStructure(projectId);
    expect(result.structure).toHaveLength(2);
    expect(result.structure[0].type).toBe("CHAPTER");
    expect(result.structure[0].title).toBe("Chapter One");
    expect(result.structure[1].title).toBe("Chapter Two");
  });

  it("exports hierarchical parts → chapters → scenes", async () => {
    const part = await StructureController.createNode({
      projectId,
      type: "PART",
      title: "Part One",
    });
    const ch = await StructureController.createNode({
      projectId,
      type: "CHAPTER",
      title: "Chapter One",
      parentId: part.id,
    });
    const scene = await StructureController.createNode({
      projectId,
      type: "SCENE",
      title: "Opening",
      parentId: ch.id,
    });
    await StructureController.writeSceneContent(
      scene.id,
      "<p>The hero awoke at dawn.</p>"
    );

    const result = await exportProjectStructure(projectId);

    expect(result.structure).toHaveLength(1);
    const exportPart = result.structure[0];
    expect(exportPart.type).toBe("PART");
    expect(exportPart.title).toBe("Part One");
    expect("chapters" in exportPart && exportPart.chapters).toHaveLength(1);

    const exportCh =
      "chapters" in exportPart ? exportPart.chapters[0] : undefined;
    expect(exportCh).toBeDefined();
    expect(exportCh!.type).toBe("CHAPTER");
    expect(exportCh!.title).toBe("Chapter One");
    expect(exportCh!.scenes).toHaveLength(1);

    const exportScene = exportCh!.scenes[0];
    expect(exportScene.type).toBe("SCENE");
    expect(exportScene.title).toBe("Opening");
    expect(exportScene.wordCount).toBeGreaterThan(0);
  });

  it("aggregates word counts up the hierarchy", async () => {
    const ch = await StructureController.createNode({
      projectId,
      type: "CHAPTER",
      title: "Chapter One",
    });
    const s1 = await StructureController.createNode({
      projectId,
      type: "SCENE",
      title: "Scene 1",
      parentId: ch.id,
    });
    const s2 = await StructureController.createNode({
      projectId,
      type: "SCENE",
      title: "Scene 2",
      parentId: ch.id,
    });
    await StructureController.writeSceneContent(s1.id, "<p>One two three</p>");
    await StructureController.writeSceneContent(s2.id, "<p>Four five</p>");

    const result = await exportProjectStructure(projectId);

    const exportCh = result.structure[0];
    expect(exportCh.type).toBe("CHAPTER");
    // Chapter word count = sum of scene word counts
    expect(exportCh.wordCount).toBeGreaterThan(0);
    // Project total word count
    expect(result.project.wordCount).toBe(exportCh.wordCount);
  });

  it("includes metadata fields on nodes", async () => {
    const ch = await StructureController.createNode({
      projectId,
      type: "CHAPTER",
      title: "Test Chapter",
      synopsis: "A test chapter",
    });

    const result = await exportProjectStructure(projectId);
    const exportCh = result.structure[0];

    expect(exportCh.id).toBe(ch.id);
    expect(exportCh.synopsis).toBe("A test chapter");
    expect(exportCh.status).toBeTruthy();
    expect(exportCh.orderIndex).toBeDefined();
    expect(exportCh.createdAt).toBeTruthy();
    expect(exportCh.updatedAt).toBeTruthy();
  });

  it("throws for non-existent project", async () => {
    await expect(exportProjectStructure("nonexistent")).rejects.toThrow(
      "Project not found"
    );
  });
});
