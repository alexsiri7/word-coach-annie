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
        where: { conversation: { projectId } },
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
          toNode: { select: { id: true, projectId: true } },
          toObject: { select: { id: true, projectId: true } },
        },
      }),
    ]);

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

  // Filter relationships to this project
  const projectRelationships = relationships
    .filter((r) => {
      const fromProjectId = r.fromNode?.projectId || r.fromObject?.projectId;
      const toProjectId = r.toNode?.projectId || r.toObject?.projectId;
      return fromProjectId === projectId || toProjectId === projectId;
    })
    .map(({ fromNode: _fn, fromObject: _fo, toNode: _tn, toObject: _to, ...rel }) => rel);

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      author: project.author,
      synopsis: project.synopsis,
      genre: project.genre,
      projectType: project.projectType,
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
    relationships: projectRelationships.map((r) => ({
      id: r.id,
      type: r.type,
      label: r.label,
      fromNodeId: r.fromNodeId,
      fromObjectId: r.fromObjectId,
      toNodeId: r.toNodeId,
      toObjectId: r.toObjectId,
      createdAt: r.createdAt.toISOString(),
    })),
    chatHistory: chatMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
