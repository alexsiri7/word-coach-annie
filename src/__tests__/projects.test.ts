import { describe, it, expect } from "vitest";
import { testPrisma } from "./setup";

describe("Project CRUD", () => {
  it("creates a project with all fields", async () => {
    const project = await testPrisma.project.create({
      data: {
        title: "My Novel",
        author: "Test Author",
        synopsis: "A test novel",
        genre: "Fantasy",
      },
    });

    expect(project.id).toBeDefined();
    expect(project.title).toBe("My Novel");
    expect(project.author).toBe("Test Author");
    expect(project.synopsis).toBe("A test novel");
    expect(project.genre).toBe("Fantasy");
    expect(project.createdAt).toBeInstanceOf(Date);
    expect(project.updatedAt).toBeInstanceOf(Date);
  });

  it("creates a project with only title (defaults for other fields)", async () => {
    const project = await testPrisma.project.create({
      data: { title: "Minimal Project" },
    });

    expect(project.title).toBe("Minimal Project");
    expect(project.author).toBe("");
    expect(project.synopsis).toBe("");
    expect(project.genre).toBe("");
  });

  it("lists projects ordered by updatedAt desc", async () => {
    await testPrisma.project.create({ data: { title: "Old Project", updatedAt: new Date("2025-01-01T00:00:00Z") } });
    await testPrisma.project.create({ data: { title: "New Project", updatedAt: new Date("2025-01-01T00:00:01Z") } });

    const projects = await testPrisma.project.findMany({
      orderBy: { updatedAt: "desc" },
    });

    expect(projects).toHaveLength(2);
    // Most recently created should be first
    expect(projects[0].title).toBe("New Project");
  });

  it("updates a project", async () => {
    const project = await testPrisma.project.create({
      data: { title: "Original Title" },
    });

    const updated = await testPrisma.project.update({
      where: { id: project.id },
      data: { title: "Updated Title", genre: "Sci-Fi" },
    });

    expect(updated.title).toBe("Updated Title");
    expect(updated.genre).toBe("Sci-Fi");
  });

  it("deletes a project and cascades to children", async () => {
    const project = await testPrisma.project.create({
      data: { title: "To Delete" },
    });

    const chapter = await testPrisma.structureNode.create({
      data: {
        projectId: project.id,
        type: "CHAPTER",
        title: "Chapter 1",
      },
    });

    const scene = await testPrisma.structureNode.create({
      data: {
        projectId: project.id,
        parentId: chapter.id,
        type: "SCENE",
        title: "Scene 1",
      },
    });

    await testPrisma.contentVersion.create({
      data: {
        nodeId: scene.id,
        content: "Some content",
        wordCount: 2,
      },
    });

    await testPrisma.storyObject.create({
      data: {
        projectId: project.id,
        type: "CHARACTER",
        name: "Alice",
      },
    });

    // Delete should cascade
    await testPrisma.project.delete({ where: { id: project.id } });

    const nodes = await testPrisma.structureNode.findMany({
      where: { projectId: project.id },
    });
    expect(nodes).toHaveLength(0);

    const objects = await testPrisma.storyObject.findMany({
      where: { projectId: project.id },
    });
    expect(objects).toHaveLength(0);

    const versions = await testPrisma.contentVersion.findMany({
      where: { nodeId: scene.id },
    });
    expect(versions).toHaveLength(0);
  });
});

describe("Project Archive", () => {
  it("archives a project by setting archivedAt", async () => {
    const project = await testPrisma.project.create({
      data: { title: "Archivable" },
    });

    expect(project.archivedAt).toBeNull();

    const updated = await testPrisma.project.update({
      where: { id: project.id },
      data: { archivedAt: new Date() },
    });

    expect(updated.archivedAt).toBeInstanceOf(Date);
  });

  it("unarchives a project by setting archivedAt to null", async () => {
    const project = await testPrisma.project.create({
      data: { title: "Restore Me", archivedAt: new Date() },
    });

    expect(project.archivedAt).toBeInstanceOf(Date);

    const updated = await testPrisma.project.update({
      where: { id: project.id },
      data: { archivedAt: null },
    });

    expect(updated.archivedAt).toBeNull();
  });

  it("filters projects by archive status", async () => {
    await testPrisma.project.create({ data: { title: "Active" } });
    const archivedProject = await testPrisma.project.create({ data: { title: "Archived" } });
    // Archive via update (mirrors real usage)
    await testPrisma.project.update({
      where: { id: archivedProject.id },
      data: { archivedAt: new Date() },
    });

    const active = await testPrisma.project.findMany({
      where: { archivedAt: null },
    });
    expect(active).toHaveLength(1);
    expect(active[0].title).toBe("Active");

    const all = await testPrisma.project.findMany();
    const archived = all.filter((p) => p.archivedAt !== null);
    expect(archived).toHaveLength(1);
    expect(archived[0].title).toBe("Archived");
  });
});
