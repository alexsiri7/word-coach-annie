import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { ProgressController } from "@/lib/controllers/progress";

describe("ProgressController.getProjectProgress", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({
      data: { title: "Progress Test", author: "Author" },
    });
    projectId = project.id;
  });

  it("returns correct word counts per status", async () => {
    const chapter = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
    });

    // DRAFT scene with 3 words
    const draft = await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Draft Scene", orderIndex: 0, status: "DRAFT" },
    });
    await testPrisma.contentVersion.create({
      data: { nodeId: draft.id, content: "<p>One two three</p>", wordCount: 3 },
    });

    // REVISED scene with 5 words
    const revised = await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Revised Scene", orderIndex: 1, status: "REVISED" },
    });
    await testPrisma.contentVersion.create({
      data: { nodeId: revised.id, content: "<p>One two three four five</p>", wordCount: 5 },
    });

    // FINAL scene with 2 words
    const final = await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Final Scene", orderIndex: 2, status: "FINAL" },
    });
    await testPrisma.contentVersion.create({
      data: { nodeId: final.id, content: "<p>Two words</p>", wordCount: 2 },
    });

    const progress = await ProgressController.getProjectProgress(projectId);

    expect(progress.totalWords).toBe(10);
    expect(progress.totalScenes).toBe(3);
    expect(progress.draftedScenes).toBe(1);
    expect(progress.revisedScenes).toBe(1);
    expect(progress.finalScenes).toBe(1);
    expect(progress.outlineScenes).toBe(0);
  });

  it("part breakdown includes chapters with nested scenes", async () => {
    const part = await testPrisma.structureNode.create({
      data: { projectId, type: "PART", title: "Part One", orderIndex: 0 },
    });
    const chapter = await testPrisma.structureNode.create({
      data: { projectId, parentId: part.id, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
    });
    const scene = await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Scene 1", orderIndex: 0, status: "DRAFT" },
    });
    await testPrisma.contentVersion.create({
      data: { nodeId: scene.id, content: "<p>Hello world</p>", wordCount: 2 },
    });

    const progress = await ProgressController.getProjectProgress(projectId);

    expect(progress.parts).toHaveLength(1);
    expect(progress.parts[0].title).toBe("Part One");
    expect(progress.parts[0].totalScenes).toBe(1);
    expect(progress.parts[0].totalWords).toBe(2);
  });

  it("next scene is the first non-FINAL scene in order", async () => {
    const chapter = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
    });
    await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Done Scene", orderIndex: 0, status: "FINAL" },
    });
    await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Next Scene", orderIndex: 1, status: "OUTLINE" },
    });

    const progress = await ProgressController.getProjectProgress(projectId);

    expect(progress.nextScene).not.toBeNull();
    expect(progress.nextScene!.title).toBe("Next Scene");
    expect(progress.nextScene!.status).toBe("OUTLINE");
  });

  it("empty project returns zeroed metrics without error", async () => {
    const progress = await ProgressController.getProjectProgress(projectId);

    expect(progress.totalWords).toBe(0);
    expect(progress.totalScenes).toBe(0);
    expect(progress.draftedScenes).toBe(0);
    expect(progress.revisedScenes).toBe(0);
    expect(progress.finalScenes).toBe(0);
    expect(progress.outlineScenes).toBe(0);
    expect(progress.parts).toHaveLength(0);
    expect(progress.nextScene).toBeNull();
  });

  it("pace is null when no writing sessions exist", async () => {
    const chapter = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
    });
    await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "S1", orderIndex: 0, status: "DRAFT" },
    });

    const progress = await ProgressController.getProjectProgress(projectId);
    expect(progress.pace).toBeNull();
  });
});
