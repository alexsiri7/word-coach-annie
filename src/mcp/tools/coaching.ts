import { prisma } from "@/lib/db";

// ─── Plot Thread Status ─────────────────────────────────────────────────────

export type PlotlineStatus = "advancing" | "mentioned" | "dormant";

export interface PlotlineIndicator {
  id: string;
  name: string;
  status: PlotlineStatus;
  lastSeenTitle?: string;
}

export interface ScenePlotThreadStatus {
  sceneId: string;
  sceneTitle: string;
  indicators: PlotlineIndicator[];
}

export async function getPlotThreadStatus(projectId: string): Promise<ScenePlotThreadStatus[]> {
  const allNodes = await prisma.structureNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, type: true, title: true, parentId: true, orderIndex: true },
  });

  const plotlines = await prisma.storyObject.findMany({
    where: { projectId, type: "PLOTLINE" },
    select: { id: true, name: true },
  });

  if (plotlines.length === 0) return [];

  const plotlineIds = plotlines.map((p) => p.id);
  const sceneIds = allNodes.filter((n) => n.type === "SCENE").map((n) => n.id);
  if (sceneIds.length === 0) return [];

  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [
        { fromObjectId: { in: plotlineIds }, toNodeId: { in: sceneIds } },
        { fromNodeId: { in: sceneIds }, toObjectId: { in: plotlineIds } },
      ],
    },
    select: {
      fromObjectId: true,
      fromNodeId: true,
      toObjectId: true,
      toNodeId: true,
    },
  });

  const sceneToPlotlines = new Map<string, Set<string>>();
  for (const rel of relationships) {
    const sceneId = rel.fromNodeId ?? rel.toNodeId;
    const plotlineId = rel.fromObjectId ?? rel.toObjectId;
    if (!sceneId || !plotlineId) continue;
    if (!sceneToPlotlines.has(sceneId)) sceneToPlotlines.set(sceneId, new Set());
    sceneToPlotlines.get(sceneId)!.add(plotlineId);
  }

  const orderedScenes = buildOrderedScenes(allNodes);
  const plotlineLastSeenTitle = new Map<string, string>();
  const plotlineMap = new Map(plotlines.map((p) => [p.id, p.name]));

  const result: ScenePlotThreadStatus[] = [];

  for (const scene of orderedScenes) {
    const activePlotlineIds = sceneToPlotlines.get(scene.id) ?? new Set<string>();
    const indicators: PlotlineIndicator[] = [];

    for (const plotlineId of activePlotlineIds) {
      const name = plotlineMap.get(plotlineId) ?? "Unknown";
      const wasSeenBefore = plotlineLastSeenTitle.has(plotlineId);
      indicators.push({
        id: plotlineId,
        name,
        status: wasSeenBefore ? "advancing" : "mentioned",
      });
    }

    for (const [plotlineId, lastTitle] of plotlineLastSeenTitle.entries()) {
      if (!activePlotlineIds.has(plotlineId)) {
        indicators.push({
          id: plotlineId,
          name: plotlineMap.get(plotlineId) ?? "Unknown",
          status: "dormant",
          lastSeenTitle: lastTitle,
        });
      }
    }

    result.push({ sceneId: scene.id, sceneTitle: scene.title, indicators });

    for (const plotlineId of activePlotlineIds) {
      plotlineLastSeenTitle.set(plotlineId, scene.title);
    }
  }

  return result;
}

// ─── Scene Focus ─────────────────────────────────────────────────────────────

export async function getSceneFocus(sceneId: string) {
  const scene = await prisma.structureNode.findUnique({
    where: { id: sceneId },
    include: { project: { select: { title: true, id: true } } },
  });
  if (!scene) throw new Error(`Scene not found: ${sceneId}`);

  const siblings = await prisma.structureNode.findMany({
    where: { projectId: scene.projectId, type: "SCENE" },
    orderBy: [{ parent: { orderIndex: "asc" } }, { orderIndex: "asc" }],
    select: { id: true, title: true, orderIndex: true, status: true, parent: { select: { title: true } } },
  });

  const currentIndex = siblings.findIndex((s) => s.id === sceneId);
  const prevScene = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextScene = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  const version = await prisma.contentVersion.findFirst({
    where: { nodeId: sceneId },
    orderBy: { createdAt: "desc" },
    select: { wordCount: true },
  });

  let chapterTitle = null;
  if (scene.parentId) {
    const parent = await prisma.structureNode.findUnique({
      where: { id: scene.parentId },
      select: { title: true },
    });
    chapterTitle = parent?.title || null;
  }

  // Related elements
  const relationships = await prisma.relationship.findMany({
    where: { OR: [{ fromNodeId: sceneId }, { toNodeId: sceneId }] },
    include: {
      fromObject: true,
      toObject: true,
      fromWorldObject: true,
      toWorldObject: true,
    },
  });

  const relatedObjects: { id: string; type: string; name: string; description: string | null; role: string | null; source: "project" | "universe" }[] = [];
  const seenIds = new Set<string>();

  for (const rel of relationships) {
    const storyObj = rel.fromObject || rel.toObject;
    if (storyObj && !seenIds.has(storyObj.id)) {
      relatedObjects.push({
        id: storyObj.id,
        type: storyObj.type,
        name: storyObj.name,
        description: storyObj.description,
        role: storyObj.role,
        source: "project",
      });
      seenIds.add(storyObj.id);
    }
    const worldObj = rel.fromWorldObject || rel.toWorldObject;
    if (worldObj && !seenIds.has(worldObj.id)) {
      relatedObjects.push({
        id: worldObj.id,
        type: worldObj.type,
        name: worldObj.name,
        description: worldObj.description,
        role: null,
        source: "universe",
      });
      seenIds.add(worldObj.id);
    }
  }

  // Annotations
  const annotations = await prisma.annotation.findMany({
    where: { nodeId: sceneId },
    orderBy: { createdAt: "desc" },
  });

  return {
    scene: {
      id: scene.id,
      title: scene.title,
      synopsis: scene.synopsis,
      status: scene.status,
      projectId: scene.projectId,
      projectTitle: scene.project.title,
      chapterTitle,
      wordCount: version?.wordCount || 0,
      prevScene: prevScene ? { id: prevScene.id, title: prevScene.title } : null,
      nextScene: nextScene ? { id: nextScene.id, title: nextScene.title } : null,
    },
    relatedElements: relatedObjects,
    annotations: annotations.map((a) => ({
      id: a.id,
      content: a.content,
      resolved: a.resolved,
      selectedText: a.selectedText,
    })),
    timelineScenes: siblings.map((s) => ({ id: s.id, title: s.title, status: s.status, orderIndex: s.orderIndex, chapterTitle: s.parent?.title ?? undefined })),
  };
}

// ─── Manuscript Context ──────────────────────────────────────────────────────

export async function getManuscriptContext(projectId: string) {
  const [project, nodes, storyObjects, relationships] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.structureNode.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      include: {
        contentVersions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, wordCount: true },
        },
      },
    }),
    prisma.storyObject.findMany({
      where: { projectId },
      select: { id: true, type: true, name: true, description: true, role: true },
    }),
    prisma.relationship.findMany({
      where: {
        OR: [
          { fromObject: { projectId } },
          { toObject: { projectId } },
        ],
      },
      include: {
        fromObject: { select: { name: true, type: true } },
        toObject: { select: { name: true, type: true } },
      },
      take: 30,
    }),
  ]);

  if (!project) throw new Error("Project not found");

  const chapters = nodes.filter((n) => n.type === "CHAPTER");
  const scenes = nodes.filter((n) => n.type === "SCENE");

  const outlineWithContent = chapters
    .map((ch) => {
      const chScenes = scenes
        .filter((s) => s.parentId === ch.id)
        .map((s) => {
          const content = s.contentVersions[0]?.content || "";
          const preview = content
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 300);
          return `    Scene: ${s.title} [${s.status}]${s.synopsis ? ` — ${s.synopsis}` : ""}${preview ? `\n      Content preview: ${preview}...` : ""}`;
        })
        .join("\n");
      return `Chapter: ${ch.title}${ch.synopsis ? ` — ${ch.synopsis}` : ""}\n${chScenes}`;
    })
    .join("\n\n");

  const characters = storyObjects
    .filter((o) => o.type === "CHARACTER")
    .map((o) => `${o.name}${o.role ? ` (${o.role})` : ""}${o.description ? `: ${o.description.slice(0, 200)}` : ""}`)
    .join("\n");

  const plotlines = storyObjects
    .filter((o) => o.type === "PLOTLINE")
    .map((o) => `${o.name}${o.description ? `: ${o.description.slice(0, 200)}` : ""}`)
    .join("\n");

  const relationshipsText = relationships
    .filter((r) => r.fromObject && r.toObject)
    .map((r) => `${r.fromObject!.name} → ${r.toObject!.name}: ${r.type}`)
    .join("\n");

  return {
    project: { id: project.id, title: project.title, genre: project.genre },
    outlineWithContent,
    characters,
    plotlines,
    relationships: relationshipsText,
  };
}

// ─── Consistency Context ─────────────────────────────────────────────────────

export async function getConsistencyContext(projectId: string, focusSceneId?: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  });
  if (!project) throw new Error("Project not found");

  const characters = await prisma.storyObject.findMany({
    where: { projectId, type: "CHARACTER" },
    select: { id: true, name: true, description: true, notes: true, role: true },
  });

  if (characters.length === 0) return { project, characters: [], scenes: [] };

  const scenes = await prisma.structureNode.findMany({
    where: { projectId, type: "SCENE" },
    orderBy: { orderIndex: "asc" },
    select: { id: true, title: true },
  });

  const targetSceneIds = focusSceneId
    ? [focusSceneId]
    : scenes.slice(0, 20).map((s) => s.id);

  const scenesWithContent: { id: string; title: string; content: string }[] = [];

  for (const sceneId of targetSceneIds) {
    const version = await prisma.contentVersion.findFirst({
      where: { nodeId: sceneId },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    const scene = scenes.find((s) => s.id === sceneId);
    if (scene && version?.content) {
      const textContent = version.content
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 800);
      if (textContent.length > 50) {
        scenesWithContent.push({ id: sceneId, title: scene.title, content: textContent });
      }
    }
  }

  return {
    project,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      description: c.description?.slice(0, 300) || null,
      notes: c.notes?.slice(0, 200) || null,
    })),
    scenes: scenesWithContent,
  };
}

// ─── Story Bible Cross-Reference ────────────────────────────────────────────

export interface StoryBibleEntry {
  id: string;
  type: string;
  name: string;
  description: string | null;
  notes: string | null;
  role: string | null;
  tags: string[];
  linkedSceneIds: string[];
}

export interface CrossReferenceScene {
  id: string;
  title: string;
  content: string;
  linkedObjectIds: string[];
}

export async function getStoryBibleCrossReference(projectId: string, sceneId?: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  });
  if (!project) throw new Error("Project not found");

  // Fetch ALL story object types — not just characters
  const storyObjects = await prisma.storyObject.findMany({
    where: { projectId },
    select: { id: true, type: true, name: true, description: true, notes: true, role: true, tags: true },
  });

  if (storyObjects.length === 0) return { project, storyObjects: [], scenes: [], instructions: "" };

  const scenes = await prisma.structureNode.findMany({
    where: { projectId, type: "SCENE" },
    orderBy: { orderIndex: "asc" },
    select: { id: true, title: true },
  });

  const targetSceneIds = sceneId
    ? [sceneId]
    : scenes.slice(0, 15).map((s) => s.id);

  // Fetch relationships to map objects ↔ scenes
  const objectIds = storyObjects.map((o) => o.id);
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [
        { fromObjectId: { in: objectIds }, toNodeId: { in: targetSceneIds } },
        { fromNodeId: { in: targetSceneIds }, toObjectId: { in: objectIds } },
      ],
    },
    select: { fromObjectId: true, fromNodeId: true, toObjectId: true, toNodeId: true },
  });

  // Build bidirectional maps
  const objectToScenes = new Map<string, Set<string>>();
  const sceneToObjects = new Map<string, Set<string>>();

  for (const rel of relationships) {
    const objId = rel.fromObjectId ?? rel.toObjectId;
    const nodeId = rel.fromNodeId ?? rel.toNodeId;
    if (!objId || !nodeId) continue;

    if (!objectToScenes.has(objId)) objectToScenes.set(objId, new Set());
    objectToScenes.get(objId)!.add(nodeId);

    if (!sceneToObjects.has(nodeId)) sceneToObjects.set(nodeId, new Set());
    sceneToObjects.get(nodeId)!.add(objId);
  }

  // Fetch scene content with larger windows for cross-referencing
  const scenesWithContent: CrossReferenceScene[] = [];

  for (const sid of targetSceneIds) {
    const version = await prisma.contentVersion.findFirst({
      where: { nodeId: sid },
      orderBy: { createdAt: "desc" },
      select: { content: true },
    });
    const scene = scenes.find((s) => s.id === sid);
    if (scene && version?.content) {
      const textContent = version.content
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000);
      if (textContent.length > 50) {
        scenesWithContent.push({
          id: sid,
          title: scene.title,
          content: textContent,
          linkedObjectIds: Array.from(sceneToObjects.get(sid) ?? []),
        });
      }
    }
  }

  const storyBibleEntries: StoryBibleEntry[] = storyObjects.map((o) => ({
    id: o.id,
    type: o.type,
    name: o.name,
    description: o.description?.slice(0, 600) || null,
    notes: o.notes?.slice(0, 400) || null,
    role: o.role,
    tags: o.tags ? (typeof o.tags === "string" ? (o.tags as string).split(",").map((t: string) => t.trim()) : o.tags as string[]) : [],
    linkedSceneIds: Array.from(objectToScenes.get(o.id) ?? []),
  }));

  const instructions = `## Cross-Reference Instructions

Compare each story object's defined attributes against how they appear in the prose.
For each mismatch found, report:
- **Object**: which story object (name, type, ID)
- **Attribute**: what differs (e.g. hair color, location description, timeline event)
- **Story Bible says**: the value from the story object definition
- **Prose says**: what the scene text states
- **Scene**: which scene contains the discrepancy (title, ID)
- **Severity**: CRITICAL (reader-facing contradiction), MAJOR (notable inconsistency), MINOR (trivial difference)

IMPORTANT: Do NOT decide which version is correct. Present both versions and ask the author which is the source of truth. Never silently overwrite either the prose or the story object.

After presenting mismatches, offer these resolution options for each:
1. **Update story object** → use \`update_story_object\` to sync the bible to match the prose
2. **Flag scene for revision** → use \`add_annotation\` on the scene to mark the prose for editing
3. **Keep both** → the difference is intentional (e.g. unreliable narrator, character growth)`;

  return {
    project,
    storyObjects: storyBibleEntries,
    scenes: scenesWithContent,
    instructions,
  };
}

// ─── Voice Context ───────────────────────────────────────────────────────────

export async function getVoiceContext(projectId: string, sceneId: string) {
  const sceneRelationships = await prisma.relationship.findMany({
    where: { OR: [{ fromNodeId: sceneId }, { toNodeId: sceneId }] },
    select: { fromObjectId: true, toObjectId: true },
  });

  const linkedObjectIds = new Set<string>();
  for (const rel of sceneRelationships) {
    if (rel.fromObjectId) linkedObjectIds.add(rel.fromObjectId);
    if (rel.toObjectId) linkedObjectIds.add(rel.toObjectId);
  }

  const characters = linkedObjectIds.size > 0
    ? await prisma.storyObject.findMany({
        where: { id: { in: Array.from(linkedObjectIds) }, type: "CHARACTER", projectId },
        select: { id: true, name: true, description: true, notes: true, role: true },
      })
    : [];

  // Get scene text
  const version = await prisma.contentVersion.findFirst({
    where: { nodeId: sceneId },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  const sceneText = version?.content
    ? version.content
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500)
    : "";

  return {
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      description: c.description?.slice(0, 400) || null,
      notes: c.notes?.slice(0, 200) || null,
    })),
    sceneText,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface NodeInfo {
  id: string;
  type: string;
  title: string;
  parentId: string | null;
  orderIndex: number;
}

function buildOrderedScenes(nodes: NodeInfo[]): NodeInfo[] {
  const childrenMap = new Map<string | null, NodeInfo[]>();
  for (const node of nodes) {
    const key = node.parentId ?? null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(node);
  }
  for (const children of childrenMap.values()) {
    children.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const scenes: NodeInfo[] = [];
  function traverse(parentId: string | null) {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      if (child.type === "SCENE") scenes.push(child);
      else traverse(child.id);
    }
  }
  traverse(null);
  return scenes;
}
