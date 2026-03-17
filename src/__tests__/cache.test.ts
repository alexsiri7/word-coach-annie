import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub navigator for Node.js test environment
const navigatorStub = { onLine: true };
vi.stubGlobal("navigator", navigatorStub);

// In-memory IDB mock
const stores: Record<string, Map<string, Record<string, unknown>>> = {
  projects: new Map(),
  structureNodes: new Map(),
  contentVersions: new Map(),
  storyObjects: new Map(),
  annotations: new Map(),
  pendingOps: new Map(),
};

function resetStores() {
  for (const store of Object.values(stores)) store.clear();
}

vi.mock("@/lib/offline/idb", () => {
  const mockTxStore = (storeName: string) => ({
    put: vi.fn(async (val: Record<string, unknown>) => {
      stores[storeName].set(val.id as string, val);
    }),
    delete: vi.fn(async (key: string) => {
      stores[storeName].delete(key);
    }),
  });

  const mockTx = (storeName: string) => ({
    store: mockTxStore(storeName),
    done: Promise.resolve(),
  });

  const mockDb = {
    get: vi.fn(async (store: string, key: string) => stores[store]?.get(key)),
    put: vi.fn(async (store: string, val: Record<string, unknown>) => {
      stores[store]?.set(val.id as string, val);
    }),
    delete: vi.fn(async (store: string, key: string) => {
      stores[store]?.delete(key);
    }),
    getAll: vi.fn(async (store: string) => [...(stores[store]?.values() ?? [])]),
    getAllFromIndex: vi.fn(async (store: string, _index: string, key: string) => {
      const all = [...(stores[store]?.values() ?? [])];
      if (store === "structureNodes") return all.filter((v) => v.projectId === key);
      if (store === "storyObjects") return all.filter((v) => v.projectId === key);
      if (store === "contentVersions") return all.filter((v) => v.nodeId === key);
      if (store === "annotations") return all.filter((v) => v.nodeId === key);
      return all;
    }),
    transaction: vi.fn((_store: string) => mockTx(_store)),
  };

  return {
    getDB: vi.fn(async () => mockDb),
    idbGet: vi.fn(async (store: string, key: string) => stores[store]?.get(key)),
    idbPut: vi.fn(async (store: string, val: Record<string, unknown>) => {
      stores[store]?.set(val.id as string, val);
      return val.id;
    }),
    idbDelete: vi.fn(async (store: string, key: string) => {
      stores[store]?.delete(key);
    }),
    idbGetAll: vi.fn(async (store: string) => [...(stores[store]?.values() ?? [])]),
    idbGetNodesByProject: vi.fn(async (projectId: string) =>
      [...stores.structureNodes.values()].filter((v) => v.projectId === projectId)
    ),
    idbGetStoryObjectsByProject: vi.fn(async (projectId: string) =>
      [...stores.storyObjects.values()].filter((v) => v.projectId === projectId)
    ),
    idbGetContentByNode: vi.fn(async (nodeId: string) =>
      [...stores.contentVersions.values()].filter((v) => v.nodeId === nodeId)
    ),
    idbGetAnnotationsByNode: vi.fn(async (nodeId: string) =>
      [...stores.annotations.values()].filter((v) => v.nodeId === nodeId)
    ),
    idbClear: vi.fn(async (store: string) => stores[store]?.clear()),
  };
});

import { cachedFetch, invalidateProjectCache } from "@/lib/offline/cache";

describe("offline cache", () => {
  beforeEach(() => {
    navigatorStub.onLine = true;
    resetStores();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    navigatorStub.onLine = true;
  });

  describe("cachedFetch — online", () => {
    it("fetches from network and caches project list", async () => {
      const projects = [
        {
          id: "p1",
          title: "Novel",
          author: "Author",
          synopsis: "",
          genre: "Fantasy",
          projectType: "FICTION",
          wordCount: 1000,
          nodeCount: 5,
          createdAt: "2025-01-01",
          updatedAt: "2025-01-02",
        },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ projects }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      const res = await cachedFetch("/api/projects");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.projects).toHaveLength(1);
      expect(data.projects[0].title).toBe("Novel");

      // Wait for background cache write
      await new Promise((r) => setTimeout(r, 50));

      // Verify data was cached
      expect(stores.projects.has("p1")).toBe(true);
      expect(stores.projects.get("p1")?.title).toBe("Novel");
    });

    it("caches single project on GET /api/projects/:id", async () => {
      const project = {
        id: "p2",
        title: "Short Stories",
        author: "Writer",
        synopsis: "A collection",
        genre: "Literary",
        projectType: "GENERAL",
        wordCount: 500,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(project), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await cachedFetch("/api/projects/p2");
      await new Promise((r) => setTimeout(r, 50));

      expect(stores.projects.has("p2")).toBe(true);
    });

    it("caches outline tree as flat nodes", async () => {
      const tree = [
        {
          id: "ch1",
          projectId: "p1",
          parentId: null,
          type: "CHAPTER",
          title: "Chapter 1",
          synopsis: "",
          status: "OUTLINE",
          orderIndex: 0,
          createdAt: "2025-01-01",
          updatedAt: "2025-01-02",
          children: [
            {
              id: "sc1",
              projectId: "p1",
              parentId: "ch1",
              type: "SCENE",
              title: "Scene 1",
              synopsis: "",
              status: "DRAFT",
              orderIndex: 0,
              createdAt: "2025-01-01",
              updatedAt: "2025-01-02",
              children: [],
            },
          ],
        },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ tree }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await cachedFetch("/api/projects/p1/nodes");
      await new Promise((r) => setTimeout(r, 50));

      // Both chapter and scene should be cached flat
      expect(stores.structureNodes.has("ch1")).toBe(true);
      expect(stores.structureNodes.has("sc1")).toBe(true);
      expect(stores.structureNodes.get("sc1")?.parentId).toBe("ch1");
    });

    it("caches scene content on GET /api/nodes/:id/content", async () => {
      const content = {
        latest: {
          id: "cv1",
          nodeId: "sc1",
          content: "<p>Hello world</p>",
          wordCount: 2,
          createdAt: "2025-01-01",
        },
        history: [],
        annotations: [],
        wordCount: 2,
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(content), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );

      await cachedFetch("/api/nodes/sc1/content");
      await new Promise((r) => setTimeout(r, 50));

      expect(stores.contentVersions.has("cv1")).toBe(true);
      expect(stores.contentVersions.get("cv1")?.content).toBe("<p>Hello world</p>");
    });

    it("passes through non-cacheable routes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ ok: true }), { status: 200 })
        )
      );

      await cachedFetch("/api/health");
      expect(fetch).toHaveBeenCalledWith("/api/health", undefined);
    });

    it("passes through non-GET requests", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ id: "new" }), { status: 201 })
        )
      );

      await cachedFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title: "New" }),
      });

      expect(fetch).toHaveBeenCalled();
      // Should NOT cache POST responses
      expect(stores.projects.size).toBe(0);
    });
  });

  describe("cachedFetch — offline fallback", () => {
    it("returns cached projects when offline", async () => {
      // Pre-populate cache
      stores.projects.set("p1", {
        id: "p1",
        title: "Cached Novel",
        author: "Author",
        synopsis: "",
        genre: "Fantasy",
        projectType: "FICTION",
        wordCount: 1000,
        nodeCount: 5,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      });

      navigatorStub.onLine = false;

      const res = await cachedFetch("/api/projects");
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Cache")).toBe("idb");

      const data = await res.json();
      expect(data.projects).toHaveLength(1);
      expect(data.projects[0].title).toBe("Cached Novel");
    });

    it("returns cached outline tree reconstructed from flat nodes", async () => {
      stores.structureNodes.set("ch1", {
        id: "ch1",
        projectId: "p1",
        parentId: null,
        type: "CHAPTER",
        title: "Chapter 1",
        synopsis: "",
        status: "OUTLINE",
        orderIndex: 0,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      });
      stores.structureNodes.set("sc1", {
        id: "sc1",
        projectId: "p1",
        parentId: "ch1",
        type: "SCENE",
        title: "Scene 1",
        synopsis: "",
        status: "DRAFT",
        orderIndex: 0,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
      });

      navigatorStub.onLine = false;

      const res = await cachedFetch("/api/projects/p1/nodes");
      const data = await res.json();

      expect(data.tree).toHaveLength(1);
      expect(data.tree[0].id).toBe("ch1");
      expect(data.tree[0].children).toHaveLength(1);
      expect(data.tree[0].children[0].id).toBe("sc1");
    });

    it("returns cached content for scene", async () => {
      stores.contentVersions.set("cv1", {
        id: "cv1",
        nodeId: "sc1",
        content: "<p>Cached content</p>",
        wordCount: 2,
        createdAt: "2025-01-01",
      });

      navigatorStub.onLine = false;

      const res = await cachedFetch("/api/nodes/sc1/content");
      const data = await res.json();

      expect(data.latest.content).toBe("<p>Cached content</p>");
      expect(data.wordCount).toBe(2);
    });

    it("throws when offline with no cache", async () => {
      navigatorStub.onLine = false;

      await expect(cachedFetch("/api/projects")).rejects.toThrow(
        "Network unavailable and no cached data"
      );
    });
  });

  describe("invalidateProjectCache", () => {
    it("removes all cached data for a project", async () => {
      stores.projects.set("p1", { id: "p1", title: "Test" } as Record<string, unknown>);
      stores.structureNodes.set("n1", { id: "n1", projectId: "p1" } as Record<string, unknown>);
      stores.storyObjects.set("so1", { id: "so1", projectId: "p1" } as Record<string, unknown>);
      stores.contentVersions.set("cv1", { id: "cv1", nodeId: "n1" } as Record<string, unknown>);
      stores.annotations.set("a1", { id: "a1", nodeId: "n1" } as Record<string, unknown>);

      await invalidateProjectCache("p1");

      expect(stores.projects.has("p1")).toBe(false);
      expect(stores.structureNodes.has("n1")).toBe(false);
      expect(stores.storyObjects.has("so1")).toBe(false);
      expect(stores.contentVersions.has("cv1")).toBe(false);
      expect(stores.annotations.has("a1")).toBe(false);
    });
  });
});
