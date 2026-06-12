import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/offline/idb", () => ({
  idbPut: vi.fn(async () => "id"),
  idbGetAll: vi.fn(async () => []),
  idbGetNodesByProject: vi.fn(async () => []),
  idbGetContentByNode: vi.fn(async () => []),
  idbGetStoryObjectsByProject: vi.fn(async () => []),
}));

import {
  cacheProjects,
  getCachedProjects,
  cacheStructureNodes,
  getCachedOutline,
  cacheContentVersion,
  getCachedContent,
  cacheStoryObjects,
  getCachedStoryObjects,
} from "@/lib/offline/cache-reads";
import {
  idbPut,
  idbGetAll,
  idbGetNodesByProject,
  idbGetContentByNode,
  idbGetStoryObjectsByProject,
} from "@/lib/offline/idb";

describe("cache-reads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── cacheProjects / getCachedProjects ────────────────────────

  it("cacheProjects calls idbPut for each project", async () => {
    const projects = [
      { id: "p1", title: "Novel A", author: "", synopsis: "", genre: "", projectType: "FICTION", createdAt: "", updatedAt: "" },
      { id: "p2", title: "Novel B", author: "", synopsis: "", genre: "", projectType: "FICTION", createdAt: "", updatedAt: "" },
    ] as Parameters<typeof cacheProjects>[0];

    await cacheProjects(projects);

    expect(idbPut).toHaveBeenCalledTimes(2);
    expect(idbPut).toHaveBeenCalledWith("projects", projects[0]);
    expect(idbPut).toHaveBeenCalledWith("projects", projects[1]);
  });

  it("getCachedProjects returns result of idbGetAll", async () => {
    const mockProjects = [{ id: "p1", title: "Cached" }];
    vi.mocked(idbGetAll).mockResolvedValue(mockProjects as never);

    const result = await getCachedProjects();

    expect(idbGetAll).toHaveBeenCalledWith("projects");
    expect(result).toBe(mockProjects);
  });

  // ─── cacheStructureNodes / getCachedOutline ───────────────────

  it("cacheStructureNodes flattens tree and stores nodes without children", async () => {
    const tree = [
      {
        id: "ch1",
        projectId: "p1",
        parentId: null,
        type: "CHAPTER" as const,
        title: "Chapter 1",
        synopsis: "",
        status: "OUTLINE" as const,
        orderIndex: 0,
        createdAt: "",
        updatedAt: "",
        children: [
          {
            id: "sc1",
            projectId: "p1",
            parentId: "ch1",
            type: "SCENE" as const,
            title: "Scene 1",
            synopsis: "",
            status: "DRAFT" as const,
            orderIndex: 0,
            createdAt: "",
            updatedAt: "",
            children: [],
          },
        ],
        plotIndicators: [{ id: "pl1", name: "Thread", status: "advancing" as const }],
        hasNewFeedback: true,
      },
    ];

    await cacheStructureNodes(tree);

    expect(idbPut).toHaveBeenCalledTimes(2);
    // First call should be the chapter, without children/plotIndicators/hasNewFeedback
    const firstCallValue = vi.mocked(idbPut).mock.calls[0][1] as Record<string, unknown>;
    expect(firstCallValue).not.toHaveProperty("children");
    expect(firstCallValue).not.toHaveProperty("plotIndicators");
    expect(firstCallValue).not.toHaveProperty("hasNewFeedback");
    expect(firstCallValue.id).toBe("ch1");
  });

  it("getCachedOutline reconstructs tree from flat nodes", async () => {
    const flatNodes = [
      { id: "ch1", projectId: "p1", parentId: null, type: "CHAPTER", title: "Ch1", synopsis: "", status: "OUTLINE", orderIndex: 0, createdAt: "", updatedAt: "" },
      { id: "sc1", projectId: "p1", parentId: "ch1", type: "SCENE", title: "Sc1", synopsis: "", status: "DRAFT", orderIndex: 0, createdAt: "", updatedAt: "" },
      { id: "sc2", projectId: "p1", parentId: "ch1", type: "SCENE", title: "Sc2", synopsis: "", status: "OUTLINE", orderIndex: 1, createdAt: "", updatedAt: "" },
    ];
    vi.mocked(idbGetNodesByProject).mockResolvedValue(flatNodes as never);

    const tree = await getCachedOutline("p1");

    expect(idbGetNodesByProject).toHaveBeenCalledWith("p1");
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("ch1");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].id).toBe("sc1");
    expect(tree[0].children[1].id).toBe("sc2");
  });

  it("getCachedOutline returns empty array when cache is empty", async () => {
    vi.mocked(idbGetNodesByProject).mockResolvedValue([]);

    const tree = await getCachedOutline("p1");

    expect(tree).toEqual([]);
  });

  it("getCachedOutline promotes orphaned nodes to root when parent is missing", async () => {
    const nodes = [
      { id: "sc1", projectId: "p1", parentId: "missing-ch", type: "SCENE",
        title: "Orphan Scene", synopsis: "", status: "DRAFT", orderIndex: 0,
        createdAt: "", updatedAt: "" },
    ];
    vi.mocked(idbGetNodesByProject).mockResolvedValue(nodes as never);

    const tree = await getCachedOutline("p1");

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("sc1");
    expect(tree[0].children).toHaveLength(0);
  });

  it("cacheStructureNodes does nothing when tree is empty", async () => {
    await cacheStructureNodes([]);
    expect(idbPut).not.toHaveBeenCalled();
  });

  // ─── cacheContentVersion / getCachedContent ───────────────────

  it("cacheContentVersion calls idbPut with the version", async () => {
    const version = { id: "v1", nodeId: "n1", content: "<p>Hello</p>", wordCount: 1, createdAt: "2026-01-01" };

    await cacheContentVersion(version);

    expect(idbPut).toHaveBeenCalledWith("contentVersions", version);
  });

  it("getCachedContent returns the latest version by createdAt", async () => {
    const versions = [
      { id: "v1", nodeId: "n1", content: "old", wordCount: 1, createdAt: "2026-01-01T00:00:00Z" },
      { id: "v2", nodeId: "n1", content: "new", wordCount: 2, createdAt: "2026-06-01T00:00:00Z" },
      { id: "v3", nodeId: "n1", content: "mid", wordCount: 1, createdAt: "2026-03-01T00:00:00Z" },
    ];
    vi.mocked(idbGetContentByNode).mockResolvedValue(versions as never);

    const result = await getCachedContent("n1");

    expect(result?.id).toBe("v2");
    expect(result?.content).toBe("new");
  });

  it("getCachedContent returns undefined when cache is empty", async () => {
    vi.mocked(idbGetContentByNode).mockResolvedValue([]);

    const result = await getCachedContent("n1");

    expect(result).toBeUndefined();
  });

  // ─── cacheStoryObjects / getCachedStoryObjects ────────────────

  it("cacheStoryObjects calls idbPut for each object", async () => {
    const objects = [
      { id: "so1", projectId: "p1", type: "CHARACTER", name: "Alice", description: "", notes: "", role: null, tags: "", createdAt: "", updatedAt: "" },
      { id: "so2", projectId: "p1", type: "LOCATION", name: "Castle", description: "", notes: "", role: null, tags: "", createdAt: "", updatedAt: "" },
    ] as Parameters<typeof cacheStoryObjects>[0];

    await cacheStoryObjects(objects);

    expect(idbPut).toHaveBeenCalledTimes(2);
    expect(idbPut).toHaveBeenCalledWith("storyObjects", objects[0]);
    expect(idbPut).toHaveBeenCalledWith("storyObjects", objects[1]);
  });

  it("getCachedStoryObjects returns result of idbGetStoryObjectsByProject", async () => {
    const mockObjects = [{ id: "so1", name: "Alice" }];
    vi.mocked(idbGetStoryObjectsByProject).mockResolvedValue(mockObjects as never);

    const result = await getCachedStoryObjects("p1");

    expect(idbGetStoryObjectsByProject).toHaveBeenCalledWith("p1");
    expect(result).toBe(mockObjects);
  });
});
