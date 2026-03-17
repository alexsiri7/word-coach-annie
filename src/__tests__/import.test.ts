import { describe, it, expect, vi } from "vitest";
import { testPrisma } from "./setup";

// Mock @/lib/db so import-json uses the test database
vi.mock("@/lib/db", () => ({
  prisma: testPrisma,
}));

import { importProjectJson } from "@/lib/import-json";

function makeExportData(overrides: Record<string, unknown> = {}) {
  return {
    exportVersion: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    project: {
      id: "old-project-id",
      title: "Test Novel",
      author: "Test Author",
      synopsis: "A test synopsis",
      genre: "Fantasy",
      projectType: "FICTION",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    structureNodes: [],
    contentVersions: [],
    storyObjects: [],
    annotations: [],
    relationships: [],
    chatHistory: [],
    ...overrides,
  };
}

describe("importProjectJson", () => {
  it("imports a minimal project (no children)", async () => {
    const result = await importProjectJson(makeExportData(), null);

    expect(result.title).toBe("Test Novel");
    expect(result.projectId).toBeDefined();
    expect(result.stats.structureNodes).toBe(0);

    const project = await testPrisma.project.findUnique({
      where: { id: result.projectId },
    });
    expect(project).not.toBeNull();
    expect(project!.title).toBe("Test Novel");
    expect(project!.author).toBe("Test Author");
    expect(project!.genre).toBe("Fantasy");
  });

  it("assigns userId when provided", async () => {
    const user = await testPrisma.user.create({
      data: { email: "test@example.com", googleId: "g123", name: "Tester" },
    });

    const result = await importProjectJson(makeExportData(), user.id);

    const project = await testPrisma.project.findUnique({
      where: { id: result.projectId },
    });
    expect(project!.userId).toBe(user.id);
  });

  it("imports structure nodes with parent-child relationships", async () => {
    const data = makeExportData({
      structureNodes: [
        {
          id: "part-1",
          parentId: null,
          type: "PART",
          title: "Part One",
          synopsis: "",
          status: "OUTLINE",
          orderIndex: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "ch-1",
          parentId: "part-1",
          type: "CHAPTER",
          title: "Chapter One",
          synopsis: "First chapter",
          status: "DRAFT",
          orderIndex: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "scene-1",
          parentId: "ch-1",
          type: "SCENE",
          title: "Opening Scene",
          synopsis: "",
          status: "DRAFT",
          orderIndex: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importProjectJson(data, null);

    const nodes = await testPrisma.structureNode.findMany({
      where: { projectId: result.projectId },
      orderBy: { orderIndex: "asc" },
    });

    expect(nodes).toHaveLength(3);

    const part = nodes.find((n) => n.type === "PART");
    const chapter = nodes.find((n) => n.type === "CHAPTER");
    const scene = nodes.find((n) => n.type === "SCENE");

    expect(part).toBeDefined();
    expect(chapter!.parentId).toBe(part!.id);
    expect(scene!.parentId).toBe(chapter!.id);

    // IDs should be remapped (not the original ones)
    expect(part!.id).not.toBe("part-1");
    expect(chapter!.id).not.toBe("ch-1");
    expect(scene!.id).not.toBe("scene-1");
  });

  it("imports content versions linked to structure nodes", async () => {
    const data = makeExportData({
      structureNodes: [
        {
          id: "scene-1",
          parentId: null,
          type: "SCENE",
          title: "Scene",
          synopsis: "",
          status: "DRAFT",
          orderIndex: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      contentVersions: [
        {
          id: "cv-1",
          nodeId: "scene-1",
          content: "<p>Hello world</p>",
          wordCount: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "cv-2",
          nodeId: "scene-1",
          content: "<p>Hello world again</p>",
          wordCount: 3,
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    });

    const result = await importProjectJson(data, null);

    const scene = await testPrisma.structureNode.findFirst({
      where: { projectId: result.projectId, type: "SCENE" },
    });

    const versions = await testPrisma.contentVersion.findMany({
      where: { nodeId: scene!.id },
    });

    expect(versions).toHaveLength(2);
    expect(versions.some((v) => v.content === "<p>Hello world</p>")).toBe(true);
    expect(versions.some((v) => v.content === "<p>Hello world again</p>")).toBe(true);
    expect(result.stats.contentVersions).toBe(2);
  });

  it("imports story objects", async () => {
    const data = makeExportData({
      storyObjects: [
        {
          id: "char-1",
          type: "CHARACTER",
          name: "Hero",
          description: "The protagonist",
          notes: "Important",
          role: "protagonist",
          tags: "main,hero",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importProjectJson(data, null);

    const objects = await testPrisma.storyObject.findMany({
      where: { projectId: result.projectId },
    });

    expect(objects).toHaveLength(1);
    expect(objects[0].name).toBe("Hero");
    expect(objects[0].type).toBe("CHARACTER");
    expect(objects[0].role).toBe("protagonist");
    expect(objects[0].id).not.toBe("char-1");
  });

  it("imports annotations linked to nodes", async () => {
    const data = makeExportData({
      structureNodes: [
        {
          id: "scene-1",
          parentId: null,
          type: "SCENE",
          title: "Scene",
          synopsis: "",
          status: "DRAFT",
          orderIndex: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      annotations: [
        {
          id: "ann-1",
          nodeId: "scene-1",
          content: "Fix this paragraph",
          resolved: false,
          range: "0:10",
          selectedText: "Hello",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importProjectJson(data, null);

    const scene = await testPrisma.structureNode.findFirst({
      where: { projectId: result.projectId },
    });

    const annotations = await testPrisma.annotation.findMany({
      where: { nodeId: scene!.id },
    });

    expect(annotations).toHaveLength(1);
    expect(annotations[0].content).toBe("Fix this paragraph");
    expect(annotations[0].selectedText).toBe("Hello");
  });

  it("imports relationships with remapped IDs", async () => {
    const data = makeExportData({
      structureNodes: [
        {
          id: "ch-1",
          parentId: null,
          type: "CHAPTER",
          title: "Ch 1",
          synopsis: "",
          status: "OUTLINE",
          orderIndex: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      storyObjects: [
        {
          id: "char-1",
          type: "CHARACTER",
          name: "Hero",
          description: "",
          notes: "",
          role: null,
          tags: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      relationships: [
        {
          id: "rel-1",
          type: "APPEARS_IN",
          label: "Main character",
          fromObjectId: "char-1",
          fromNodeId: null,
          toNodeId: "ch-1",
          toObjectId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importProjectJson(data, null);

    const rels = await testPrisma.relationship.findMany();
    expect(rels).toHaveLength(1);
    expect(rels[0].type).toBe("APPEARS_IN");
    expect(rels[0].label).toBe("Main character");

    // Verify remapped IDs point to real records
    const obj = await testPrisma.storyObject.findFirst({
      where: { projectId: result.projectId },
    });
    const node = await testPrisma.structureNode.findFirst({
      where: { projectId: result.projectId },
    });
    expect(rels[0].fromObjectId).toBe(obj!.id);
    expect(rels[0].toNodeId).toBe(node!.id);
  });

  it("imports chat history", async () => {
    const data = makeExportData({
      chatHistory: [
        {
          id: "msg-1",
          role: "user",
          content: "Help me with this scene",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Sure, here are some suggestions",
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    });

    const result = await importProjectJson(data, null);

    const messages = await testPrisma.chatMessage.findMany({
      where: { projectId: result.projectId },
    });

    expect(messages).toHaveLength(2);
    expect(result.stats.chatMessages).toBe(2);
  });

  it("rejects invalid export version", async () => {
    await expect(
      importProjectJson({ exportVersion: 99, project: { title: "X" } }, null)
    ).rejects.toThrow("Unsupported export version");
  });

  it("rejects non-object input", async () => {
    await expect(importProjectJson("not json", null)).rejects.toThrow(
      "Invalid JSON"
    );
  });

  it("rejects missing project", async () => {
    await expect(
      importProjectJson({ exportVersion: 1 }, null)
    ).rejects.toThrow("missing project");
  });

  it("generates unique project IDs for repeated imports", async () => {
    const data = makeExportData();
    const result1 = await importProjectJson(data, null);
    const result2 = await importProjectJson(data, null);

    expect(result1.projectId).not.toBe(result2.projectId);
  });

  it("skips orphaned content versions and annotations", async () => {
    const data = makeExportData({
      contentVersions: [
        {
          id: "cv-orphan",
          nodeId: "nonexistent-node",
          content: "orphan",
          wordCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      annotations: [
        {
          id: "ann-orphan",
          nodeId: "nonexistent-node",
          content: "orphan",
          resolved: false,
          range: "",
          selectedText: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await importProjectJson(data, null);

    const versions = await testPrisma.contentVersion.findMany();
    const annotations = await testPrisma.annotation.findMany();
    expect(versions).toHaveLength(0);
    expect(annotations).toHaveLength(0);
    expect(result.projectId).toBeDefined();
  });
});
