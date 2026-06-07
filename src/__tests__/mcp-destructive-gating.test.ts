import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all heavy dependencies to avoid DB/filesystem calls
vi.mock("../mcp/snapshot", () => ({
  initSnapshotRepo: vi.fn(),
  createSnapshot: vi.fn(() => ({ hash: "abc123", message: "test" })),
  listSnapshots: vi.fn(() => []),
  restoreSnapshot: vi.fn(() => ({ hash: "def456", message: "restored" })),
  autoSnapshot: vi.fn(),
}));

vi.mock("../mcp/tools/projects", () => ({
  listProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => ({})),
  createProject: vi.fn(async () => ({ id: "p1" })),
  updateProject: vi.fn(async () => ({ id: "p1" })),
}));

vi.mock("../mcp/tools/structure", () => ({
  getOutline: vi.fn(async () => []),
  createNode: vi.fn(async () => ({ id: "n1" })),
  updateNode: vi.fn(async () => ({ id: "n1" })),
  deleteNode: vi.fn(async () => ({ deleted: true })),
  readSceneContent: vi.fn(async () => ({ content: "" })),
  writeSceneContent: vi.fn(async () => ({})),
  writeSceneContentFromBlocks: vi.fn(async () => ({})),
  updateParagraph: vi.fn(async () => ({})),
  insertBeat: vi.fn(async () => ({})),
  getSceneVersions: vi.fn(async () => []),
  restoreSceneVersion: vi.fn(async () => ({})),
  addAnnotation: vi.fn(async () => ({})),
  updateAnnotation: vi.fn(async () => ({})),
  deleteAnnotation: vi.fn(async () => ({})),
  resolveAnnotation: vi.fn(async () => ({})),
  getOpenAnnotations: vi.fn(async () => []),
  batchCreateNodes: vi.fn(async () => ({})),
  batchUpdateNodes: vi.fn(async () => ({})),
  batchDeleteNodes: vi.fn(async () => ({})),
}));

vi.mock("../mcp/tools/story-objects", () => ({
  listStoryObjects: vi.fn(async () => []),
  getStoryObject: vi.fn(async () => ({})),
  createStoryObject: vi.fn(async () => ({})),
  updateStoryObject: vi.fn(async () => ({})),
  deleteStoryObject: vi.fn(async () => ({ deleted: true })),
  batchCreateStoryObjects: vi.fn(async () => ({})),
  batchUpdateStoryObjects: vi.fn(async () => ({})),
  batchDeleteStoryObjects: vi.fn(async () => ({})),
}));

vi.mock("../mcp/tools/writing-tasks", () => ({
  listWritingTasks: vi.fn(async () => []),
  createWritingTask: vi.fn(async () => ({})),
  completeWritingTask: vi.fn(async () => ({})),
  updateWritingTask: vi.fn(async () => ({})),
}));

vi.mock("../mcp/tools/relationships", () => ({
  listRelationships: vi.fn(async () => []),
  createRelationship: vi.fn(async () => ({})),
  deleteRelationship: vi.fn(async () => ({ deleted: true })),
}));

vi.mock("../mcp/tools/export", () => ({
  exportManuscript: vi.fn(async () => ""),
  exportStoryBible: vi.fn(async () => ""),
  exportHashnode: vi.fn(async () => ""),
  getProjectSummary: vi.fn(async () => ({})),
}));

vi.mock("../mcp/tools/snapshots", () => ({
  snapshotDatabase: vi.fn(async () => ({})),
  listDatabaseSnapshots: vi.fn(async () => []),
  restoreDatabaseSnapshot: vi.fn(async () => ({ restored: true })),
}));

vi.mock("../mcp/tools/universes", () => ({
  listUniverses: vi.fn(async () => []),
  getUniverse: vi.fn(async () => ({})),
  createUniverse: vi.fn(async () => ({})),
  updateUniverse: vi.fn(async () => ({})),
  deleteUniverse: vi.fn(async () => ({ deleted: true })),
  listWorldObjects: vi.fn(async () => []),
  getWorldObject: vi.fn(async () => ({})),
  createWorldObject: vi.fn(async () => ({})),
  updateWorldObject: vi.fn(async () => ({})),
  deleteWorldObject: vi.fn(async () => ({ deleted: true })),
  addTimelineEntry: vi.fn(async () => ({})),
  updateTimelineEntry: vi.fn(async () => ({})),
  deleteTimelineEntry: vi.fn(async () => ({ deleted: true })),
  reorderTimelineEntries: vi.fn(async () => ({})),
  transferStoryObjectToUniverse: vi.fn(async () => ({})),
  linkProjectToUniverse: vi.fn(async () => ({})),
  unlinkProjectFromUniverse: vi.fn(async () => ({})),
}));

vi.mock("../mcp/tools/coaching", () => ({
  getPlotThreadStatus: vi.fn(async () => ({})),
  getSceneFocus: vi.fn(async () => ({
    scene: { id: "s1", title: "S1", status: "DRAFT", projectId: "p1", synopsis: "", projectTitle: "Test", wordCount: 0, chapterTitle: null, prevScene: null, nextScene: null },
    relatedElements: [],
    annotations: [],
    timelineScenes: [],
  })),
  getManuscriptContext: vi.fn(async () => ({})),
  getConsistencyContext: vi.fn(async () => ({})),
  getVoiceContext: vi.fn(async () => ({})),
  getStoryBibleCrossReference: vi.fn(async () => ({})),
}));

vi.mock("../mcp/skills", () => ({
  loadSkill: vi.fn(() => null),
  listSkills: vi.fn(() => []),
}));

vi.mock("@/lib/telemetry", () => ({
  getTracer: vi.fn(() => ({
    startActiveSpan: vi.fn((_name: string, fn: (span: unknown) => unknown) =>
      fn({ setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() })
    ),
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    peerReview: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/ai/peer-review-service", () => ({
  runPeerReview: vi.fn(async () => ({})),
}));

vi.mock("@/lib/review-routing", () => ({
  REVIEW_SKILL_BY_STATUS: { DRAFT: "developmental-edit", OUTLINE: "outline-review", REVISED: "line-edit", FINAL: "consistency-check" },
}));

vi.mock("@/lib/review-personas", () => ({
  REVIEW_PERSONAS: {},
}));

vi.mock("../lib/controllers/google-auth", () => ({
  GoogleAuthController: {
    getStatus: vi.fn(async () => ({ connected: false })),
    getAuthUrl: vi.fn(() => "https://example.com/auth"),
    handleCallback: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  },
}));

vi.mock("../lib/export/google-docs-exporter", () => ({
  GoogleDocsExporter: {
    exportToGoogleDocs: vi.fn(async () => ({ googleDocUrl: "https://docs.google.com/test" })),
  },
}));

import { deleteNode } from "../mcp/tools/structure";
import { listProjects } from "../mcp/tools/projects";
import { restoreDatabaseSnapshot } from "../mcp/tools/snapshots";
import { deleteRelationship } from "../mcp/tools/relationships";

/** Access internal tool registry from McpServer */
function getToolHandler(server: unknown, name: string) {
  const tools = (server as { _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }> })._registeredTools;
  return tools[name];
}

describe("MCP destructive tool gating", () => {
  let origEnv: string | undefined;

  beforeEach(() => {
    origEnv = process.env.MCP_ALLOW_DESTRUCTIVE;
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (origEnv !== undefined) process.env.MCP_ALLOW_DESTRUCTIVE = origEnv;
    else delete process.env.MCP_ALLOW_DESTRUCTIVE;
  });

  it("blocks destructive tools when allowDestructive=false", async () => {
    const { createServer } = await import("../mcp/index");
    const server = createServer({ allowDestructive: false });

    const tool = getToolHandler(server, "delete_node");
    expect(tool).toBeDefined();

    const result = await tool.handler({ nodeId: "test-id" }) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("destructive tool is disabled");
    expect(deleteNode).not.toHaveBeenCalled();
  });

  it("allows destructive tools when allowDestructive=true", async () => {
    const { createServer } = await import("../mcp/index");
    const server = createServer({ allowDestructive: true });

    const tool = getToolHandler(server, "delete_node");
    expect(tool).toBeDefined();

    await tool.handler({ nodeId: "test-id" });
    expect(deleteNode).toHaveBeenCalledWith("test-id");
  });

  it("defaults to blocking when env MCP_ALLOW_DESTRUCTIVE is unset", async () => {
    delete process.env.MCP_ALLOW_DESTRUCTIVE;
    const { createServer } = await import("../mcp/index");
    const server = createServer();

    const tool = getToolHandler(server, "restore_snapshot");
    expect(tool).toBeDefined();

    const result = await tool.handler({ commitHash: "abc123" }) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("destructive tool is disabled");
    expect(restoreDatabaseSnapshot).not.toHaveBeenCalled();
  });

  it("respects MCP_ALLOW_DESTRUCTIVE=true env when no option provided", async () => {
    process.env.MCP_ALLOW_DESTRUCTIVE = "true";
    const { createServer } = await import("../mcp/index");
    const server = createServer();

    const tool = getToolHandler(server, "delete_relationship");
    expect(tool).toBeDefined();

    await tool.handler({ relationshipId: "rel-1" });
    expect(deleteRelationship).toHaveBeenCalledWith("rel-1");
  });

  it("non-destructive tools work regardless of allowDestructive=false", async () => {
    const { createServer } = await import("../mcp/index");
    const server = createServer({ allowDestructive: false });

    const tool = getToolHandler(server, "list_projects");
    expect(tool).toBeDefined();

    const result = await tool.handler({}) as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.content).toBeDefined();
    expect(listProjects).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });
});
