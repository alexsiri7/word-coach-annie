import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";

describe("Story Objects", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({
      data: { title: "Test Novel" },
    });
    projectId = project.id;
  });

  it("creates a character with all fields", async () => {
    const character = await testPrisma.storyObject.create({
      data: {
        projectId,
        type: "CHARACTER",
        name: "Alice",
        description: "The protagonist",
        notes: "Brave and curious",
        role: "protagonist",
        tags: "main,hero",
      },
    });

    expect(character.name).toBe("Alice");
    expect(character.type).toBe("CHARACTER");
    expect(character.role).toBe("protagonist");
    expect(character.tags).toBe("main,hero");
  });

  it("creates different story object types", async () => {
    const types = ["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"] as const;

    for (const type of types) {
      await testPrisma.storyObject.create({
        data: { projectId, type, name: `Test ${type}` },
      });
    }

    const all = await testPrisma.storyObject.findMany({
      where: { projectId },
    });

    expect(all).toHaveLength(5);
  });

  it("filters story objects by type", async () => {
    await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Alice" },
    });
    await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Bob" },
    });
    await testPrisma.storyObject.create({
      data: { projectId, type: "LOCATION", name: "Tavern" },
    });

    const characters = await testPrisma.storyObject.findMany({
      where: { projectId, type: "CHARACTER" },
    });

    expect(characters).toHaveLength(2);
  });

  it("deletes story object and cascades relationships", async () => {
    const char = await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Alice" },
    });

    const scene = await testPrisma.structureNode.create({
      data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0 },
    });

    await testPrisma.relationship.create({
      data: {
        type: "APPEARS_IN",
        fromObjectId: char.id,
        toNodeId: scene.id,
      },
    });

    await testPrisma.storyObject.delete({ where: { id: char.id } });

    const rels = await testPrisma.relationship.findMany({
      where: { fromObjectId: char.id },
    });
    expect(rels).toHaveLength(0);
  });
});

describe("Relationships", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({
      data: { title: "Test Novel" },
    });
    projectId = project.id;
  });

  it("creates a relationship between a character and a scene", async () => {
    const char = await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Alice" },
    });

    const scene = await testPrisma.structureNode.create({
      data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0 },
    });

    const rel = await testPrisma.relationship.create({
      data: {
        type: "APPEARS_IN",
        label: "as protagonist",
        fromObjectId: char.id,
        toNodeId: scene.id,
      },
    });

    expect(rel.type).toBe("APPEARS_IN");
    expect(rel.label).toBe("as protagonist");
    expect(rel.fromObjectId).toBe(char.id);
    expect(rel.toNodeId).toBe(scene.id);
    expect(rel.fromNodeId).toBeNull();
    expect(rel.toObjectId).toBeNull();
  });

  it("creates relationships between two story objects", async () => {
    const char1 = await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Alice" },
    });

    const char2 = await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Bob" },
    });

    await testPrisma.relationship.create({
      data: {
        type: "RELATED_TO",
        label: "siblings",
        fromObjectId: char1.id,
        toObjectId: char2.id,
      },
    });

    const rels = await testPrisma.relationship.findMany({
      where: {
        OR: [
          { fromObjectId: char1.id },
          { toObjectId: char1.id },
        ],
      },
    });

    expect(rels).toHaveLength(1);
    expect(rels[0].label).toBe("siblings");
  });

  it("loads relationships with related entities", async () => {
    const char = await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Alice" },
    });

    const scene = await testPrisma.structureNode.create({
      data: { projectId, type: "SCENE", title: "Opening Scene", orderIndex: 0 },
    });

    await testPrisma.relationship.create({
      data: {
        type: "APPEARS_IN",
        fromObjectId: char.id,
        toNodeId: scene.id,
      },
    });

    const rels = await testPrisma.relationship.findMany({
      include: {
        fromObject: true,
        toNode: true,
      },
    });

    expect(rels).toHaveLength(1);
    expect(rels[0].fromObject?.name).toBe("Alice");
    expect(rels[0].toNode?.title).toBe("Opening Scene");
  });
});
