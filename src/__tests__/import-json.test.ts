import { describe, it, expect } from "vitest";
import { testPrisma } from "./setup";
import { importProjectJson } from "@/lib/import-json";

const minimalExport = {
  exportVersion: 1,
  project: {
    title: "Test Import",
    author: "Test Author",
    synopsis: "A test project",
    genre: "Test",
    projectType: "FICTION",
  },
  structureNodes: [],
  contentVersions: [],
  storyObjects: [],
  annotations: [],
  relationships: [],
  chatHistory: [],
};

describe("importProjectJson", () => {
  it("imports a minimal project", async () => {
    const { projectId } = await importProjectJson(minimalExport);

    const project = await testPrisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project).not.toBeNull();
    expect(project!.title).toBe("Test Import");
    expect(project!.author).toBe("Test Author");
    expect(project!.isSample).toBe(false);
  });

  it("sets isSample flag when specified", async () => {
    const { projectId } = await importProjectJson(minimalExport, {
      isSample: true,
    });

    const project = await testPrisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project!.isSample).toBe(true);
  });

  it("assigns userId when provided", async () => {
    const user = await testPrisma.user.create({
      data: { email: "test@example.com", googleId: "g-123", name: "Test" },
    });

    const { projectId } = await importProjectJson(minimalExport, {
      userId: user.id,
    });

    const project = await testPrisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project!.userId).toBe(user.id);
  });

  it("imports structure nodes with parent references", async () => {
    const data = {
      ...minimalExport,
      structureNodes: [
        {
          id: "ch1",
          parentId: null,
          type: "CHAPTER",
          title: "Chapter 1",
          synopsis: "",
          status: "OUTLINE",
          orderIndex: 0,
        },
        {
          id: "sc1",
          parentId: "ch1",
          type: "SCENE",
          title: "Scene 1",
          synopsis: "A scene",
          status: "DRAFT",
          orderIndex: 0,
        },
      ],
    };

    const { projectId } = await importProjectJson(data);

    const nodes = await testPrisma.structureNode.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
    });
    expect(nodes).toHaveLength(2);
    expect(nodes[0].title).toBe("Chapter 1");
    expect(nodes[0].parentId).toBeNull();
    expect(nodes[1].title).toBe("Scene 1");
    expect(nodes[1].parentId).toBe(nodes[0].id);
  });

  it("imports content versions linked to correct nodes", async () => {
    const data = {
      ...minimalExport,
      structureNodes: [
        {
          id: "sc1",
          parentId: null,
          type: "SCENE",
          title: "Scene 1",
          synopsis: "",
          status: "DRAFT",
          orderIndex: 0,
        },
      ],
      contentVersions: [
        {
          id: "cv1",
          nodeId: "sc1",
          content: "<p>Hello world</p>",
          wordCount: 2,
        },
      ],
    };

    const { projectId } = await importProjectJson(data);

    const nodes = await testPrisma.structureNode.findMany({
      where: { projectId },
    });
    const cvs = await testPrisma.contentVersion.findMany({
      where: { nodeId: nodes[0].id },
    });
    expect(cvs).toHaveLength(1);
    expect(cvs[0].content).toBe("<p>Hello world</p>");
    expect(cvs[0].wordCount).toBe(2);
  });

  it("imports story objects", async () => {
    const data = {
      ...minimalExport,
      storyObjects: [
        {
          id: "char1",
          type: "CHARACTER",
          name: "Holmes",
          description: "A detective",
          notes: "",
          role: "Protagonist",
          tags: "detective",
        },
      ],
    };

    const { projectId } = await importProjectJson(data);

    const objs = await testPrisma.storyObject.findMany({
      where: { projectId },
    });
    expect(objs).toHaveLength(1);
    expect(objs[0].name).toBe("Holmes");
    expect(objs[0].type).toBe("CHARACTER");
    expect(objs[0].role).toBe("Protagonist");
  });

  it("imports relationships between objects", async () => {
    const data = {
      ...minimalExport,
      storyObjects: [
        {
          id: "char1",
          type: "CHARACTER",
          name: "Holmes",
          description: "",
          notes: "",
          role: null,
          tags: "",
        },
        {
          id: "char2",
          type: "CHARACTER",
          name: "Watson",
          description: "",
          notes: "",
          role: null,
          tags: "",
        },
      ],
      relationships: [
        {
          id: "rel1",
          type: "PARTNER",
          label: "Partners",
          fromObjectId: "char1",
          fromNodeId: null,
          toObjectId: "char2",
          toNodeId: null,
        },
      ],
    };

    const { projectId } = await importProjectJson(data);

    const objs = await testPrisma.storyObject.findMany({
      where: { projectId },
    });
    const holmes = objs.find((o) => o.name === "Holmes")!;
    const watson = objs.find((o) => o.name === "Watson")!;

    const rels = await testPrisma.relationship.findMany({
      where: { fromObjectId: holmes.id },
    });
    expect(rels).toHaveLength(1);
    expect(rels[0].toObjectId).toBe(watson.id);
    expect(rels[0].type).toBe("PARTNER");
  });

  it("imports annotations on nodes", async () => {
    const data = {
      ...minimalExport,
      structureNodes: [
        {
          id: "sc1",
          parentId: null,
          type: "SCENE",
          title: "Scene 1",
          synopsis: "",
          status: "DRAFT",
          orderIndex: 0,
        },
      ],
      annotations: [
        {
          id: "ann1",
          nodeId: "sc1",
          content: "Fix this paragraph",
          resolved: false,
          range: "",
          selectedText: null,
        },
      ],
    };

    const { projectId } = await importProjectJson(data);

    const nodes = await testPrisma.structureNode.findMany({
      where: { projectId },
    });
    const anns = await testPrisma.annotation.findMany({
      where: { nodeId: nodes[0].id },
    });
    expect(anns).toHaveLength(1);
    expect(anns[0].content).toBe("Fix this paragraph");
  });

  it("imports the full sherlock sample without error", async () => {
    const sampleData = await import("@/data/sherlock-sample.json");

    const { projectId } = await importProjectJson(sampleData.default ?? sampleData, {
      isSample: true,
    });

    const project = await testPrisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project).not.toBeNull();
    expect(project!.title).toBe("A Study in Baker Street");
    expect(project!.isSample).toBe(true);

    const nodes = await testPrisma.structureNode.findMany({
      where: { projectId },
    });
    expect(nodes.length).toBeGreaterThanOrEqual(6);

    const objs = await testPrisma.storyObject.findMany({
      where: { projectId },
    });
    expect(objs.length).toBeGreaterThanOrEqual(7);

    const rels = await testPrisma.relationship.findMany({
      where: {
        OR: [
          { fromObjectId: { in: objs.map((o) => o.id) } },
          { toObjectId: { in: objs.map((o) => o.id) } },
        ],
      },
    });
    expect(rels.length).toBeGreaterThanOrEqual(7);
  });
});
