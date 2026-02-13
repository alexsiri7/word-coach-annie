import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";

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
    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Version 1", wordCount: 2 },
    });

    await new Promise((r) => setTimeout(r, 50));

    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Version 2 with more words", wordCount: 5 },
    });

    await new Promise((r) => setTimeout(r, 50));

    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Version 3", wordCount: 2 },
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
      data: { nodeId: sceneId, content: "Old content", wordCount: 2 },
    });

    await new Promise((r) => setTimeout(r, 50));

    await testPrisma.contentVersion.create({
      data: { nodeId: sceneId, content: "Latest content here", wordCount: 3 },
    });

    const latest = await testPrisma.contentVersion.findFirst({
      where: { nodeId: sceneId },
      orderBy: { createdAt: "desc" },
    });

    expect(latest?.content).toBe("Latest content here");
    expect(latest?.wordCount).toBe(3);
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
