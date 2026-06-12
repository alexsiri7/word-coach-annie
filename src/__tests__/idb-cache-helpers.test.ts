import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  cacheProjects,
  cacheStructureNodes,
  cacheContentVersion,
  cacheStoryObjects,
  getLatestCachedContent,
  idbGetAll,
  idbGetNodesByProject,
  idbGetStoryObjectsByProject,
  idbClear,
} from "@/lib/offline/idb";

beforeEach(async () => {
  await idbClear("projects");
  await idbClear("structureNodes");
  await idbClear("contentVersions");
  await idbClear("storyObjects");
  await idbClear("annotations");
  await idbClear("pendingOps");
});

describe("IDB cache helpers", () => {
  describe("cacheProjects / idbGetAll", () => {
    it("should store and retrieve projects", async () => {
      const projects = [
        {
          id: "p1",
          title: "Novel",
          author: "Alice",
          synopsis: "A story",
          genre: "Fantasy",
          projectType: "FICTION",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ];
      await cacheProjects(projects);
      const cached = await idbGetAll("projects");
      expect(cached).toHaveLength(1);
      expect(cached[0].title).toBe("Novel");
      expect(cached[0].author).toBe("Alice");
    });

    it("should upsert (not duplicate) on re-cache", async () => {
      const project = {
        id: "p1",
        title: "V1",
        author: "A",
        synopsis: "",
        genre: "",
        projectType: "FICTION",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
      await cacheProjects([project]);
      await cacheProjects([{ ...project, title: "V2" }]);
      const cached = await idbGetAll("projects");
      expect(cached).toHaveLength(1);
      expect(cached[0].title).toBe("V2");
    });

    it("should store multiple projects in a single transaction", async () => {
      const projects = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        title: `Project ${i}`,
        author: "Author",
        synopsis: "",
        genre: "",
        projectType: "FICTION",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      }));
      await cacheProjects(projects);
      const cached = await idbGetAll("projects");
      expect(cached).toHaveLength(5);
    });
  });

  describe("cacheStructureNodes / idbGetNodesByProject", () => {
    it("should store and retrieve nodes by project", async () => {
      const nodes = [
        {
          id: "n1",
          projectId: "p1",
          parentId: null,
          type: "CHAPTER",
          title: "Ch1",
          synopsis: "",
          status: "DRAFT",
          orderIndex: 0,
          wordCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "n2",
          projectId: "p2",
          parentId: null,
          type: "CHAPTER",
          title: "Ch2",
          synopsis: "",
          status: "DRAFT",
          orderIndex: 0,
          wordCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ];
      await cacheStructureNodes(nodes);
      const p1Nodes = await idbGetNodesByProject("p1");
      expect(p1Nodes).toHaveLength(1);
      expect(p1Nodes[0].title).toBe("Ch1");
    });
  });

  describe("cacheContentVersion / getLatestCachedContent", () => {
    it("should return the most recently created version", async () => {
      await cacheContentVersion({
        id: "v1",
        nodeId: "n1",
        content: "old text",
        wordCount: 1,
        createdAt: "2026-01-01T00:00:00Z",
      });
      await cacheContentVersion({
        id: "v2",
        nodeId: "n1",
        content: "new text",
        wordCount: 2,
        createdAt: "2026-06-01T00:00:00Z",
      });
      const latest = await getLatestCachedContent("n1");
      expect(latest).toBeDefined();
      expect(latest!.id).toBe("v2");
      expect(latest!.content).toBe("new text");
    });

    it("should return undefined when no versions exist", async () => {
      const result = await getLatestCachedContent("nonexistent");
      expect(result).toBeUndefined();
    });

    it("should handle a single version", async () => {
      await cacheContentVersion({
        id: "v1",
        nodeId: "n1",
        content: "only version",
        wordCount: 5,
        createdAt: "2026-03-15T00:00:00Z",
      });
      const latest = await getLatestCachedContent("n1");
      expect(latest!.id).toBe("v1");
    });
  });

  describe("cacheStoryObjects / idbGetStoryObjectsByProject", () => {
    it("should store and retrieve story objects by project", async () => {
      const objects = [
        {
          id: "so1",
          projectId: "p1",
          type: "CHARACTER",
          name: "Hero",
          description: "The main character",
          notes: "",
          role: "protagonist",
          tags: "main",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "so2",
          projectId: "p2",
          type: "LOCATION",
          name: "Castle",
          description: "A big castle",
          notes: "",
          role: null,
          tags: "",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ];
      await cacheStoryObjects(objects);
      const p1Objects = await idbGetStoryObjectsByProject("p1");
      expect(p1Objects).toHaveLength(1);
      expect(p1Objects[0].name).toBe("Hero");
    });
  });
});

describe("buildOutlineTreeFromCache / flattenOutlineTree", () => {
  // These are re-implementations of the functions defined in src/app/project/[id]/page.tsx
  // for testability. The logic matches the component-level functions.

  type FlatNode = {
    id: string;
    parentId: string | null;
    orderIndex: number;
    [k: string]: unknown;
  };
  type TreeNode = FlatNode & { children: TreeNode[] };

  function buildOutlineTreeFromCache(flat: FlatNode[]): TreeNode[] {
    const map = new Map(flat.map((n) => [n.id, { ...n, children: [] as TreeNode[] } as TreeNode]));
    const roots: TreeNode[] = [];
    for (const node of map.values()) {
      if (!node.parentId || !map.has(node.parentId)) {
        roots.push(node);
      } else {
        map.get(node.parentId)!.children.push(node);
      }
    }
    const sortTree = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.orderIndex - b.orderIndex);
      nodes.forEach((n) => sortTree(n.children));
      return nodes;
    };
    return sortTree(roots);
  }

  function flattenOutlineTree(
    nodes: TreeNode[],
    projectId: string
  ) {
    const result: Record<string, unknown>[] = [];
    const visit = (n: TreeNode) => {
      result.push({
        id: n.id,
        projectId,
        parentId: n.parentId,
        type: n.type,
        title: n.title,
        synopsis: n.synopsis,
        status: n.status,
        orderIndex: n.orderIndex,
        wordCount: n.wordCount,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      });
      n.children.forEach(visit);
    };
    nodes.forEach(visit);
    return result;
  }

  const makeNode = (overrides: Partial<{ id: string; parentId: string | null; type: string; title: string; orderIndex: number }>) => ({
    id: overrides.id ?? "n1",
    projectId: "p1",
    parentId: overrides.parentId ?? null,
    type: overrides.type ?? "CHAPTER",
    title: overrides.title ?? "Untitled",
    synopsis: "",
    status: "DRAFT",
    orderIndex: overrides.orderIndex ?? 0,
    wordCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  });

  it("should reconstruct a nested tree from flat nodes", () => {
    const flat = [
      makeNode({ id: "ch1", title: "Chapter 1" }),
      makeNode({ id: "sc1", parentId: "ch1", type: "SCENE", title: "Scene 1", orderIndex: 0 }),
      makeNode({ id: "sc2", parentId: "ch1", type: "SCENE", title: "Scene 2", orderIndex: 1 }),
    ];
    const tree = buildOutlineTreeFromCache(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].title).toBe("Scene 1");
    expect(tree[0].children[1].title).toBe("Scene 2");
  });

  it("should handle orphaned nodes as roots", () => {
    const flat = [
      makeNode({ id: "sc1", parentId: "deleted-parent", type: "SCENE", title: "Orphan" }),
    ];
    const tree = buildOutlineTreeFromCache(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe("Orphan");
  });

  it("should sort children by orderIndex", () => {
    const flat = [
      makeNode({ id: "ch1", title: "Ch" }),
      makeNode({ id: "sc2", parentId: "ch1", type: "SCENE", title: "Second", orderIndex: 1 }),
      makeNode({ id: "sc1", parentId: "ch1", type: "SCENE", title: "First", orderIndex: 0 }),
    ];
    const tree = buildOutlineTreeFromCache(flat);
    expect(tree[0].children[0].title).toBe("First");
    expect(tree[0].children[1].title).toBe("Second");
  });

  it("should handle empty input", () => {
    const tree = buildOutlineTreeFromCache([]);
    expect(tree).toHaveLength(0);
  });

  it("should preserve data through flatten → build round-trip", () => {
    const tree: TreeNode[] = [
      {
        ...makeNode({ id: "ch1", title: "Ch1" }),
        synopsis: "Chapter synopsis",
        status: "REVISED",
        children: [
          {
            ...makeNode({ id: "sc1", parentId: "ch1", type: "SCENE", title: "Sc1" }),
            status: "FINAL",
            wordCount: 100,
            children: [],
          },
        ],
      },
    ];
    const flat = flattenOutlineTree(tree, "p1") as FlatNode[];
    const rebuilt = buildOutlineTreeFromCache(flat);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].children).toHaveLength(1);
    expect(rebuilt[0].synopsis).toBe("Chapter synopsis");
    expect(rebuilt[0].status).toBe("REVISED");
    expect(rebuilt[0].children[0].status).toBe("FINAL");
    expect(rebuilt[0].children[0].wordCount).toBe(100);
  });
});
