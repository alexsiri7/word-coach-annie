import { prisma } from "@/lib/db";

export async function exportProjectJson(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Fetch all related data in parallel
  const [structureNodes, storyObjects, chatMessages, annotations, relationships] =
    await Promise.all([
      prisma.structureNode.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.storyObject.findMany({
        where: { projectId },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      }),
      prisma.chatMessage.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.annotation.findMany({
        where: { node: { projectId } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.relationship.findMany({
        include: {
          fromNode: { select: { id: true, projectId: true } },
          fromObject: { select: { id: true, projectId: true } },
          fromWorldObject: { select: { id: true, universeId: true } },
          toNode: { select: { id: true, projectId: true } },
          toObject: { select: { id: true, projectId: true } },
          toWorldObject: { select: { id: true, universeId: true } },
        },
      }),
    ]);

  // Fetch universe world objects if project belongs to a universe
  let worldObjects: Awaited<ReturnType<typeof prisma.worldObject.findMany>> = [];
  let timelineEntries: Awaited<ReturnType<typeof prisma.worldObjectTimelineEntry.findMany>> = [];
  if (project.universeId) {
    [worldObjects, timelineEntries] = await Promise.all([
      prisma.worldObject.findMany({
        where: { universeId: project.universeId },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      }),
      prisma.worldObjectTimelineEntry.findMany({
        where: { worldObject: { universeId: project.universeId } },
        orderBy: [{ worldObjectId: "asc" }, { orderIndex: "asc" }],
      }),
    ]);
  }

  // Build timeline entries lookup by worldObjectId
  const timelineByObjectId = new Map<string, typeof timelineEntries>();
  for (const entry of timelineEntries) {
    const existing = timelineByObjectId.get(entry.worldObjectId) || [];
    existing.push(entry);
    timelineByObjectId.set(entry.worldObjectId, existing);
  }

  // Get latest content versions for all scenes
  const sceneIds = structureNodes
    .filter((n) => n.type === "SCENE")
    .map((n) => n.id);
  const contentVersions =
    sceneIds.length > 0
      ? await prisma.contentVersion.findMany({
          where: { nodeId: { in: sceneIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];

  // Collect world object IDs for relationship filtering
  const worldObjectIds = new Set(worldObjects.map((o) => o.id));

  // Filter relationships to this project (including world object relationships)
  const projectRelationships = relationships
    .filter((r) => {
      const fromProjectId = r.fromNode?.projectId || r.fromObject?.projectId;
      const toProjectId = r.toNode?.projectId || r.toObject?.projectId;
      if (fromProjectId === projectId || toProjectId === projectId) return true;
      // Include relationships involving the project's universe world objects
      if (r.fromWorldObjectId && worldObjectIds.has(r.fromWorldObjectId)) return true;
      if (r.toWorldObjectId && worldObjectIds.has(r.toWorldObjectId)) return true;
      return false;
    })
    .map(({ fromNode: _fn, fromObject: _fo, fromWorldObject: _fwo, toNode: _tn, toObject: _to, toWorldObject: _two, ...rel }) => rel);

  // Build relationship lookup by entity ID (for inline relationships on objects)
  const relationshipsByEntity = new Map<string, typeof projectRelationships>();
  for (const rel of projectRelationships) {
    const entityIds = [
      rel.fromNodeId, rel.toNodeId,
      rel.fromObjectId, rel.toObjectId,
      rel.fromWorldObjectId, rel.toWorldObjectId,
    ].filter(Boolean) as string[];
    for (const eid of entityIds) {
      const existing = relationshipsByEntity.get(eid) || [];
      existing.push(rel);
      relationshipsByEntity.set(eid, existing);
    }
  }

  function formatRelationship(r: (typeof projectRelationships)[number]) {
    return {
      id: r.id,
      type: r.type,
      label: r.label,
      fromNodeId: r.fromNodeId,
      fromObjectId: r.fromObjectId,
      fromWorldObjectId: r.fromWorldObjectId,
      toNodeId: r.toNodeId,
      toObjectId: r.toObjectId,
      toWorldObjectId: r.toWorldObjectId,
      createdAt: r.createdAt.toISOString(),
    };
  }

  return {
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      author: project.author,
      synopsis: project.synopsis,
      genre: project.genre,
      projectType: project.projectType,
      universeId: project.universeId,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    structureNodes: structureNodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      type: n.type,
      title: n.title,
      synopsis: n.synopsis,
      status: n.status,
      orderIndex: n.orderIndex,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
    contentVersions: contentVersions.map((v) => ({
      id: v.id,
      nodeId: v.nodeId,
      content: v.content,
      wordCount: v.wordCount,
      createdAt: v.createdAt.toISOString(),
    })),
    storyObjects: storyObjects.map((o) => ({
      id: o.id,
      type: o.type,
      name: o.name,
      description: o.description,
      notes: o.notes,
      role: o.role,
      tags: o.tags,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      relationships: (relationshipsByEntity.get(o.id) || []).map(formatRelationship),
    })),
    worldObjects: worldObjects.map((o) => ({
      id: o.id,
      type: o.type,
      name: o.name,
      description: o.description,
      notes: o.notes,
      tags: o.tags,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      timeline: (timelineByObjectId.get(o.id) || []).map((t) => ({
        id: t.id,
        label: t.label,
        orderIndex: t.orderIndex,
        description: t.description,
        attributes: t.attributes,
        projectId: t.projectId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      relationships: (relationshipsByEntity.get(o.id) || []).map(formatRelationship),
    })),
    annotations: annotations.map((a) => ({
      id: a.id,
      nodeId: a.nodeId,
      content: a.content,
      resolved: a.resolved,
      range: a.range,
      selectedText: a.selectedText,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    relationships: projectRelationships.map(formatRelationship),
    chatHistory: chatMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
