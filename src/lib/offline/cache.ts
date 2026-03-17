import {
  getDB,
  idbPut,
  idbGet,
  idbGetAll,
  idbGetNodesByProject,
  idbGetStoryObjectsByProject,
  idbGetContentByNode,
  idbGetAnnotationsByNode,
  idbDelete,
  type AnnieDBSchema,
} from "./idb";

// ─── Route → IDB Store Mapping ──────────────────────────────────────────────

type CacheableStore = "projects" | "structureNodes" | "contentVersions" | "storyObjects" | "annotations";

interface CacheRoute {
  store: CacheableStore;
  /** Extract data from API JSON response to cache */
  extract: (json: Record<string, unknown>) => AnnieDBSchema[CacheableStore]["value"][];
  /** Load fallback data from IDB for this route */
  fallback: (params: Record<string, string>) => Promise<unknown>;
  /** Re-wrap IDB data into the API response shape */
  repack: (data: unknown) => unknown;
}

interface RouteMatch {
  route: CacheRoute;
  params: Record<string, string>;
}

// ─── Route definitions ──────────────────────────────────────────────────────

const ROUTES: { pattern: RegExp; route: CacheRoute }[] = [
  {
    // GET /api/projects — project list
    pattern: /^\/api\/projects\/?$/,
    route: {
      store: "projects",
      extract: (json) => {
        const projects = json.projects as Record<string, unknown>[] | undefined;
        if (!Array.isArray(projects)) return [];
        return projects.map((p) => ({
          id: p.id as string,
          universeId: (p.universeId as string | null) ?? null,
          title: p.title as string,
          author: (p.author as string) || "",
          synopsis: (p.synopsis as string) || "",
          genre: (p.genre as string) || "",
          projectType: (p.projectType as string) || "FICTION",
          wordCount: (p.wordCount as number) || 0,
          nodeCount: (p.nodeCount as number) || 0,
          createdAt: p.createdAt as string,
          updatedAt: p.updatedAt as string,
        }));
      },
      fallback: async () => idbGetAll("projects"),
      repack: (data) => ({ projects: data }),
    },
  },
  {
    // GET /api/projects/:id — single project
    pattern: /^\/api\/projects\/(?<id>[^/]+)\/?$/,
    route: {
      store: "projects",
      extract: (json) => {
        if (!json.id) return [];
        return [
          {
            id: json.id as string,
            universeId: (json.universeId as string | null) ?? null,
            title: json.title as string,
            author: (json.author as string) || "",
            synopsis: (json.synopsis as string) || "",
            genre: (json.genre as string) || "",
            projectType: (json.projectType as string) || "FICTION",
            wordCount: (json.wordCount as number) || 0,
            nodeCount: (json.nodeCount as number) || 0,
            createdAt: json.createdAt as string,
            updatedAt: json.updatedAt as string,
          },
        ];
      },
      fallback: async (params) => idbGet("projects", params.id),
      repack: (data) => data,
    },
  },
  {
    // GET /api/projects/:id/nodes — outline tree
    pattern: /^\/api\/projects\/(?<id>[^/]+)\/nodes\/?$/,
    route: {
      store: "structureNodes",
      extract: (json) => {
        // The API returns { tree: OutlineNode[] } — flatten the tree for IDB storage
        const tree = json.tree as Record<string, unknown>[] | undefined;
        if (!Array.isArray(tree)) return [];
        const flat: AnnieDBSchema["structureNodes"]["value"][] = [];
        const walk = (nodes: Record<string, unknown>[], projectId: string) => {
          for (const n of nodes) {
            flat.push({
              id: n.id as string,
              projectId,
              parentId: (n.parentId as string | null) ?? null,
              type: n.type as string,
              title: n.title as string,
              synopsis: (n.synopsis as string) || "",
              status: (n.status as string) || "OUTLINE",
              orderIndex: (n.orderIndex as number) || 0,
              wordCount: (n.wordCount as number) || 0,
              createdAt: n.createdAt as string,
              updatedAt: n.updatedAt as string,
            });
            if (Array.isArray(n.children)) {
              walk(n.children as Record<string, unknown>[], projectId);
            }
          }
        };
        // Extract projectId from the first node
        if (tree.length > 0) {
          walk(tree, tree[0].projectId as string);
        }
        return flat;
      },
      fallback: async (params) => idbGetNodesByProject(params.id),
      repack: (data) => {
        // Reconstruct tree from flat nodes
        const nodes = data as AnnieDBSchema["structureNodes"]["value"][];
        const byId = new Map(nodes.map((n) => [n.id, { ...n, children: [] as unknown[] }]));
        const roots: unknown[] = [];
        // Sort by orderIndex first
        const sorted = [...byId.values()].sort((a, b) => a.orderIndex - b.orderIndex);
        for (const node of sorted) {
          if (node.parentId && byId.has(node.parentId)) {
            byId.get(node.parentId)!.children.push(node);
          } else {
            roots.push(node);
          }
        }
        return { tree: roots };
      },
    },
  },
  {
    // GET /api/projects/:id/story-objects — story objects list
    pattern: /^\/api\/projects\/(?<id>[^/]+)\/story-objects\/?$/,
    route: {
      store: "storyObjects",
      extract: (json) => {
        const objects = json.data as Record<string, unknown>[] | undefined;
        if (!Array.isArray(objects)) return [];
        return objects.map((o) => ({
          id: o.id as string,
          projectId: o.projectId as string,
          type: o.type as string,
          name: o.name as string,
          description: (o.description as string) || "",
          notes: (o.notes as string) || "",
          role: (o.role as string | null) ?? null,
          tags: (o.tags as string) || "",
          source: (o.source as "project" | "universe") || "project",
          createdAt: o.createdAt as string,
          updatedAt: o.updatedAt as string,
        }));
      },
      fallback: async (params) => idbGetStoryObjectsByProject(params.id),
      repack: (data) => ({ data }),
    },
  },
  {
    // GET /api/nodes/:id/content — scene content + annotations
    pattern: /^\/api\/nodes\/(?<id>[^/]+)\/content\/?$/,
    route: {
      store: "contentVersions",
      extract: (json) => {
        const items: AnnieDBSchema["contentVersions"]["value"][] = [];
        const latest = json.latest as Record<string, unknown> | undefined;
        if (latest && latest.id) {
          items.push({
            id: latest.id as string,
            nodeId: latest.nodeId as string,
            content: (latest.content as string) || "",
            wordCount: (latest.wordCount as number) || 0,
            createdAt: latest.createdAt as string,
          });
        }
        // Also cache annotations if present
        const annotations = json.annotations as Record<string, unknown>[] | undefined;
        if (Array.isArray(annotations)) {
          cacheAnnotations(annotations);
        }
        return items;
      },
      fallback: async (params) => {
        const versions = await idbGetContentByNode(params.id);
        const annotations = await idbGetAnnotationsByNode(params.id);
        return { versions, annotations };
      },
      repack: (data) => {
        const d = data as {
          versions: AnnieDBSchema["contentVersions"]["value"][];
          annotations: AnnieDBSchema["annotations"]["value"][];
        };
        // Sort by createdAt desc, return latest
        const sorted = d.versions.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return {
          latest: sorted[0] || null,
          history: sorted,
          annotations: d.annotations,
          wordCount: sorted[0]?.wordCount || 0,
        };
      },
    },
  },
];

/** Cache annotations side-effect (called from content route extract) */
async function cacheAnnotations(annotations: Record<string, unknown>[]) {
  const db = await getDB();
  const tx = db.transaction("annotations", "readwrite");
  for (const a of annotations) {
    await tx.store.put({
      id: a.id as string,
      nodeId: a.nodeId as string,
      content: (a.content as string) || "",
      range: (a.range as string) || "",
      selectedText: (a.selectedText as string | null) ?? null,
      resolved: (a.resolved as boolean) || false,
      createdAt: a.createdAt as string,
      updatedAt: a.updatedAt as string,
    });
  }
  await tx.done;
}

function matchRoute(url: string): RouteMatch | null {
  // Strip query string
  const path = url.split("?")[0];
  for (const { pattern, route } of ROUTES) {
    const match = path.match(pattern);
    if (match) {
      return { route, params: match.groups || {} };
    }
  }
  return null;
}

// ─── Cache Write ─────────────────────────────────────────────────────────────

/** Cache API response data into IndexedDB. Call after a successful fetch. */
async function cacheResponse(
  route: CacheRoute,
  json: Record<string, unknown>
): Promise<void> {
  try {
    const items = route.extract(json);
    if (items.length === 0) return;

    const db = await getDB();
    const tx = db.transaction(route.store, "readwrite");
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.store.put(item as any);
    }
    await tx.done;
  } catch {
    // Cache write failures are non-fatal
  }
}

// ─── Cache Read (Fallback) ───────────────────────────────────────────────────

/** Load cached data from IndexedDB when the network is unavailable. */
async function loadFromCache(
  route: CacheRoute,
  params: Record<string, string>
): Promise<Response | null> {
  try {
    const data = await route.fallback(params);
    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    const repacked = route.repack(data);
    return new Response(JSON.stringify(repacked), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "idb",
      },
    });
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch with IndexedDB caching. On success, mirrors response data to IDB.
 * When offline or on network error, falls back to IDB cached data.
 *
 * Only intercepts GET requests to known cacheable API routes.
 * Non-GET requests pass through to offlineFetch.
 */
export async function cachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = (init?.method ?? "GET").toUpperCase();

  // Only cache GET requests
  if (method !== "GET") {
    return fetch(input, init);
  }

  const match = matchRoute(url);

  // Not a cacheable route — pass through
  if (!match) {
    return fetch(input, init);
  }

  const { route, params } = match;

  // Try network first
  if (navigator.onLine) {
    try {
      const res = await fetch(input, init);
      if (res.ok) {
        // Clone response so we can read JSON for caching and still return original
        const clone = res.clone();
        // Cache in background — don't block the response
        clone.json().then((json) => cacheResponse(route, json)).catch(() => {});
      }
      return res;
    } catch {
      // Network error even though navigator.onLine — fall through to cache
    }
  }

  // Offline or network error — try IDB cache
  const cached = await loadFromCache(route, params);
  if (cached) return cached;

  // No cache available — throw network error
  throw new Error("Network unavailable and no cached data");
}

/**
 * Invalidate cached data for a specific project in IDB.
 * Called after mutations to ensure stale data doesn't persist.
 */
export async function invalidateProjectCache(projectId: string): Promise<void> {
  try {
    const db = await getDB();

    // Remove project
    await db.delete("projects", projectId);

    // Remove structure nodes for this project
    const nodes = await idbGetNodesByProject(projectId);
    const nodeTx = db.transaction("structureNodes", "readwrite");
    for (const node of nodes) {
      await nodeTx.store.delete(node.id);
    }
    await nodeTx.done;

    // Remove story objects for this project
    const objects = await idbGetStoryObjectsByProject(projectId);
    const objTx = db.transaction("storyObjects", "readwrite");
    for (const obj of objects) {
      await objTx.store.delete(obj.id);
    }
    await objTx.done;

    // Remove content versions and annotations for project nodes
    for (const node of nodes) {
      const versions = await idbGetContentByNode(node.id);
      const cvTx = db.transaction("contentVersions", "readwrite");
      for (const v of versions) {
        await cvTx.store.delete(v.id);
      }
      await cvTx.done;

      const annos = await idbGetAnnotationsByNode(node.id);
      const annoTx = db.transaction("annotations", "readwrite");
      for (const a of annos) {
        await annoTx.store.delete(a.id);
      }
      await annoTx.done;
    }
  } catch {
    // Invalidation failures are non-fatal
  }
}
