import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";

describe("Structure Nodes", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({
      data: { title: "Test Novel" },
    });
    projectId = project.id;
  });

  it("creates a chapter at the project level", async () => {
    const chapter = await testPrisma.structureNode.create({
      data: {
        projectId,
        type: "CHAPTER",
        title: "Chapter 1",
        orderIndex: 0,
      },
    });

    expect(chapter.type).toBe("CHAPTER");
    expect(chapter.parentId).toBeNull();
    expect(chapter.status).toBe("OUTLINE");
  });

  it("creates scenes under a chapter", async () => {
    const chapter = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
    });

    const scene1 = await testPrisma.structureNode.create({
      data: {
        projectId,
        parentId: chapter.id,
        type: "SCENE",
        title: "Scene 1",
        orderIndex: 0,
      },
    });

    const scene2 = await testPrisma.structureNode.create({
      data: {
        projectId,
        parentId: chapter.id,
        type: "SCENE",
        title: "Scene 2",
        orderIndex: 1,
      },
    });

    const children = await testPrisma.structureNode.findMany({
      where: { parentId: chapter.id },
      orderBy: { orderIndex: "asc" },
    });

    expect(children).toHaveLength(2);
    expect(children[0].title).toBe("Scene 1");
    expect(children[1].title).toBe("Scene 2");
  });

  it("builds a hierarchical outline tree", async () => {
    const ch1 = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
    });

    await testPrisma.structureNode.create({
      data: {
        projectId,
        parentId: ch1.id,
        type: "SCENE",
        title: "Scene 1.1",
        orderIndex: 0,
      },
    });

    const ch2 = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Ch 2", orderIndex: 1 },
    });

    await testPrisma.structureNode.create({
      data: {
        projectId,
        parentId: ch2.id,
        type: "SCENE",
        title: "Scene 2.1",
        orderIndex: 0,
      },
    });

    // Build the tree
    const allNodes = await testPrisma.structureNode.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
    });

    const nodeMap = new Map<string, typeof allNodes[0] & { children: typeof allNodes }>();
    const roots: (typeof allNodes[0] & { children: typeof allNodes })[] = [];

    for (const node of allNodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    for (const node of allNodes) {
      const mapped = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(mapped);
      } else {
        roots.push(mapped);
      }
    }

    expect(roots).toHaveLength(2);
    expect(roots[0].title).toBe("Ch 1");
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].title).toBe("Scene 1.1");
    expect(roots[1].title).toBe("Ch 2");
    expect(roots[1].children).toHaveLength(1);
  });

  it("deletes a chapter and cascades to scenes", async () => {
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

    await testPrisma.contentVersion.create({
      data: { nodeId: scene.id, content: "Hello world", wordCount: 2 },
    });

    await testPrisma.structureNode.delete({ where: { id: chapter.id } });

    const remaining = await testPrisma.structureNode.findMany({
      where: { projectId },
    });
    expect(remaining).toHaveLength(0);

    const versions = await testPrisma.contentVersion.findMany({
      where: { nodeId: scene.id },
    });
    expect(versions).toHaveLength(0);
  });
});
