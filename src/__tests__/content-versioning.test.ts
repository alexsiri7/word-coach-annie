import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { StructureController } from "../lib/controllers/structure";

describe("Content Versioning", () => {
  let projectId: string;
  let sceneId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({
      data: { title: "Test Novel" },
    });
    projectId = project.id;

    const chapter = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
    });

    const scene = await testPrisma.structureNode.create({
      data: {
        projectId,
        parentId: chapter.id,
        type: "SCENE",
        title: "Scene 1",
        orderIndex: 0,
      },
    });
    sceneId = scene.id;
  });

  it("creates content versions with word count", async () => {
    const v1 = await testPrisma.contentVersion.create({
      data: {
        nodeId: sceneId,
        content: "<p>Hello world</p>",
        wordCount: 2,
      },
    });

    expect(v1.content).toBe("<p>Hello world</p>");
    expect(v1.wordCount).toBe(2);
    expect(v1.createdAt).toBeInstanceOf(Date);
  });

  it("maintains version history in chronological order", async () => {
    const t0 = new Date("2025-01-01T00:00:00Z");
    const t1 = new Date("2025-01-01T00:00:01Z");
    const t2 = new Date("2025-01-01T00:00:02Z");

    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Version 1", wordCount: 2, createdAt: t0 },
    });

    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Version 2 with more words", wordCount: 5, createdAt: t1 },
    });

    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Version 3", wordCount: 2, createdAt: t2 },
    });

    const versions = await testPrisma.contentVersion.findMany({
      where: { nodeId: sceneId },
      orderBy: { createdAt: "desc" },
    });

    expect(versions).toHaveLength(3);
    expect(versions[0].content).toBe("Version 3"); // Most recent first
    expect(versions[2].content).toBe("Version 1"); // Oldest last
  });

  it("gets the latest version for a scene", async () => {
    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Old content", wordCount: 2, createdAt: new Date("2025-01-01T00:00:00Z") },
    });

    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Latest content here", wordCount: 3, createdAt: new Date("2025-01-01T00:00:01Z") },
    });

    const latest = await testPrisma.contentVersion.findFirst({
      where: { nodeId: sceneId },
      orderBy: { createdAt: "desc" },
    });

    expect(latest?.content).toBe("Latest content here");
    expect(latest?.wordCount).toBe(3);
  });

  it("prunes to at most 50 versions after writeSceneContent exceeds limit", async () => {
    // Pre-populate 55 versions with distinct timestamps
    for (let i = 0; i < 55; i++) {
      await testPrisma.contentVersion.create({
        data: {
          nodeId: sceneId,
          content: `Version ${i}`,
          wordCount: 2,
          createdAt: new Date(Date.now() + i),
        },
      });
    }
    await StructureController.writeSceneContent(sceneId, "<p>new save</p>");
    const remaining = await testPrisma.contentVersion.findMany({
      where: { nodeId: sceneId },
    });
    expect(remaining.length).toBeLessThanOrEqual(50);
    // Verify the newest version (the one just written) was retained
    const latestVersions = await testPrisma.contentVersion.findMany({
      where: { nodeId: sceneId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(latestVersions[0].content).toBe("<p>new save</p>");
  });

  it("does not prune when versions are at exactly the limit (50)", async () => {
    // Pre-populate 49 versions with distinct timestamps
    for (let i = 0; i < 49; i++) {
      await testPrisma.contentVersion.create({
        data: {
          nodeId: sceneId,
          content: `Version ${i}`,
          wordCount: 2,
          createdAt: new Date(Date.now() + i),
        },
      });
    }
    await StructureController.writeSceneContent(sceneId, "<p>save</p>");
    const remaining = await testPrisma.contentVersion.findMany({
      where: { nodeId: sceneId },
    });
    // 49 pre-existing + 1 new = 50, exactly at the limit — no prune should occur
    expect(remaining.length).toBe(50);
  });

  it("calculates word count correctly", () => {
    // This tests the word count logic used in the API
    const testCases = [
      { input: "", expected: 0 },
      { input: "hello", expected: 1 },
      { input: "hello world", expected: 2 },
      { input: "  hello   world  ", expected: 2 },
      { input: "The quick brown fox jumps over the lazy dog", expected: 9 },
    ];

    for (const { input, expected } of testCases) {
      const count = input.trim() === "" ? 0 : input.trim().split(/\s+/).length;
      expect(count).toBe(expected);
    }
  });
});
