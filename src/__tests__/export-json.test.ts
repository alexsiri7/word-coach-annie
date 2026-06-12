import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { exportProjectJson } from "@/lib/export-json";

describe("exportProjectJson", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({
      data: {
        title: "Export Test Project",
        author: "Test Author",
        genre: "Fantasy",
        projectType: "NOVEL",
      },
    });
    projectId = project.id;
  });

  it("throws for non-existent project", async () => {
    await expect(exportProjectJson("nonexistent-id")).rejects.toThrow(
      "Project not found"
    );
  });

  it("exports a project with no child data", async () => {
    const result = await exportProjectJson(projectId);

    expect(result.exportVersion).toBe(1);
    expect(result.exportedAt).toBeTruthy();
    expect(result.project.id).toBe(projectId);
    expect(result.project.title).toBe("Export Test Project");
    expect(result.project.author).toBe("Test Author");
    expect(result.structureNodes).toEqual([]);
    expect(result.contentVersions).toEqual([]);
    expect(result.storyObjects).toEqual([]);
    expect(result.annotations).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.chatHistory).toEqual([]);
  });

  it("exports structure nodes and content versions", async () => {
    const chapter = await testPrisma.structureNode.create({
      data: {
        projectId,
        type: "CHAPTER",
        title: "Chapter 1",
        orderIndex: 0,
      },
    });
    const scene = await testPrisma.structureNode.create({
      data: {
        projectId,
        parentId: chapter.id,
        type: "SCENE",
        title: "Opening Scene",
        orderIndex: 0,
      },
    });
    await testPrisma.contentVersion.create({
      data: {
        nodeId: scene.id,
        content: "It was a dark and stormy night...",
        wordCount: 7,
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.structureNodes).toHaveLength(2);
    expect(result.structureNodes[0].title).toBe("Chapter 1");
    expect(result.structureNodes[1].title).toBe("Opening Scene");
    expect(result.contentVersions).toHaveLength(1);
    expect(result.contentVersions[0].content).toBe(
      "It was a dark and stormy night..."
    );
    expect(result.contentVersions[0].wordCount).toBe(7);
  });

  it("exports story objects", async () => {
    await testPrisma.storyObject.create({
      data: {
        projectId,
        type: "CHARACTER",
        name: "Protagonist",
        description: "The main character",
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.storyObjects).toHaveLength(1);
    expect(result.storyObjects[0].name).toBe("Protagonist");
    expect(result.storyObjects[0].type).toBe("CHARACTER");
  });

  it("exports annotations on scenes", async () => {
    const scene = await testPrisma.structureNode.create({
      data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0 },
    });
    await testPrisma.annotation.create({
      data: {
        nodeId: scene.id,
        content: "Review this paragraph",
        resolved: false,
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].content).toBe("Review this paragraph");
    expect(result.annotations[0].resolved).toBe(false);
  });

  it("exports chat history in chronological order", async () => {
    const conversation = await testPrisma.conversation.create({
      data: { projectId, title: "Test chat" },
    });
    await testPrisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "user", content: "Help me with chapter 1" },
    });
    await testPrisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "Here are some suggestions...",
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.chatHistory).toHaveLength(2);
    expect(result.chatHistory[0].role).toBe("user");
    expect(result.chatHistory[1].role).toBe("assistant");
  });

  it("exports writing sessions", async () => {
    const scene = await testPrisma.structureNode.create({
      data: { projectId, type: "SCENE", title: "Scene WS", orderIndex: 0 },
    });
    await testPrisma.writingSession.create({
      data: {
        projectId,
        nodeId: scene.id,
        wordsWritten: 500,
        durationSeconds: 1800,
        date: "2026-06-01",
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.writingSessions).toHaveLength(1);
    expect(result.writingSessions[0].wordsWritten).toBe(500);
    expect(result.writingSessions[0].durationSeconds).toBe(1800);
    expect(result.writingSessions[0].date).toBe("2026-06-01");
    expect(result.writingSessions[0].endedAt).toBeNull();
  });

  it("exports conversations with summary", async () => {
    await testPrisma.conversation.create({
      data: {
        projectId,
        title: "Brainstorm",
        type: "chat",
        summary: "Discussed character arcs",
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].title).toBe("Brainstorm");
    expect(result.conversations[0].summary).toBe("Discussed character arcs");
  });

  it("exports google doc exports", async () => {
    await testPrisma.googleDocExport.create({
      data: {
        projectId,
        exportMode: "STORY_READER",
        googleDocId: "doc-123",
        googleDocUrl: "https://docs.google.com/doc-123",
        lastSyncedAt: new Date("2026-06-01"),
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.googleDocExports).toHaveLength(1);
    expect(result.googleDocExports[0].exportMode).toBe("STORY_READER");
    expect(result.googleDocExports[0].googleDocId).toBe("doc-123");
  });

  it("exports hashnode exports without credentialId", async () => {
    const credential = await testPrisma.hashnodeCredential.create({
      data: {
        userId: "local",
        accessToken: "test-token",
      },
    });
    await testPrisma.hashnodeExport.create({
      data: {
        projectId,
        hashnodePostId: "post-123",
        hashnodePostUrl: "https://hashnode.com/post-123",
        publishStatus: "published",
        lastSyncedAt: new Date("2026-06-01"),
        credentialId: credential.id,
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.hashnodeExports).toHaveLength(1);
    expect(result.hashnodeExports[0].hashnodePostId).toBe("post-123");
    expect(result.hashnodeExports[0].publishStatus).toBe("published");
    expect(result.hashnodeExports[0]).not.toHaveProperty("credentialId");
  });

  it("only exports relationships belonging to the project", async () => {
    const scene = await testPrisma.structureNode.create({
      data: { projectId, type: "SCENE", title: "Scene A", orderIndex: 0 },
    });
    const character = await testPrisma.storyObject.create({
      data: { projectId, type: "CHARACTER", name: "Hero" },
    });

    await testPrisma.relationship.create({
      data: {
        fromNodeId: scene.id,
        toObjectId: character.id,
        type: "APPEARS_IN",
        label: "Hero appears in Scene A",
      },
    });

    // Create another project with its own data (should not appear)
    const otherProject = await testPrisma.project.create({
      data: { title: "Other Project" },
    });
    const otherScene = await testPrisma.structureNode.create({
      data: {
        projectId: otherProject.id,
        type: "SCENE",
        title: "Other Scene",
        orderIndex: 0,
      },
    });
    const otherChar = await testPrisma.storyObject.create({
      data: { projectId: otherProject.id, type: "CHARACTER", name: "Villain" },
    });
    await testPrisma.relationship.create({
      data: {
        fromNodeId: otherScene.id,
        toObjectId: otherChar.id,
        type: "APPEARS_IN",
        label: "Villain in other scene",
      },
    });

    const result = await exportProjectJson(projectId);

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].label).toBe("Hero appears in Scene A");
  });
});
