import type { GoogleDocExport, Relationship } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function exportProjectJson(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Fetch all related data in parallel
  const [
    structureNodes, storyObjects, chatMessages, annotations, relationships,
    writingSessions, conversations, googleDocExports, hashnodeExports,
    locationImages, locationMaps, locationSnapshots, snapshotAnnotations,
  ] = await Promise.all([
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
      prisma.writingSession.findMany({
        where: { projectId },
        orderBy: { startedAt: "asc" },
      }),
      prisma.conversation.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, type: true, summary: true, createdAt: true, updatedAt: true },
      }),
      prisma.googleDocExport.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.hashnodeExport.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, nodeId: true, hashnodePostId: true, hashnodePostUrl: true,
          publishStatus: true, lastSyncedAt: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.locationImage.findMany({
        where: { storyObject: { projectId } },
        orderBy: [{ storyObjectId: "asc" }, { orderIndex: "asc" }],
      }),
      prisma.locationMap.findMany({
        where: { storyObject: { projectId } },
        orderBy: { storyObjectId: "asc" },
      }),
      prisma.locationSnapshot.findMany({
        where: { storyObject: { projectId } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.snapshotAnnotation.findMany({
        where: { location: { projectId } },
        orderBy: { createdAt: "asc" },
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
    relationships: projectRelationships.map(serializeRelationship),
    chatHistory: chatMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    writingSessions: writingSessions.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      nodeId: s.nodeId,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      wordsWritten: s.wordsWritten,
      durationSeconds: s.durationSeconds,
      date: s.date,
    })),
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      summary: c.summary,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    googleDocExports: googleDocExports.map(serializeGoogleDocExport),
    hashnodeExports: hashnodeExports.map((e) => ({
      id: e.id,
      nodeId: e.nodeId,
      hashnodePostId: e.hashnodePostId,
      hashnodePostUrl: e.hashnodePostUrl,
      publishStatus: e.publishStatus,
      lastSyncedAt: e.lastSyncedAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      // credentialId intentionally excluded — points to raw OAuth token, metadata-only export
    })),
    // Image files stay in storage; the export references them by path.
    locationImages: locationImages.map((i) => ({
      id: i.id,
      storyObjectId: i.storyObjectId,
      kind: i.kind,
      caption: i.caption,
      orderIndex: i.orderIndex,
      isCover: i.isCover,
      storagePath: i.storagePath,
      thumbPath: i.thumbPath,
      width: i.width,
      height: i.height,
      bytes: i.bytes,
      sha256: i.sha256,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
    locationMaps: locationMaps.map((m) => ({
      id: m.id,
      storyObjectId: m.storyObjectId,
      widthM: m.widthM,
      heightM: m.heightM,
      backgroundImageId: m.backgroundImageId,
      items: m.items,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
    locationSnapshots: locationSnapshots.map((s) => ({
      id: s.id,
      storyObjectId: s.storyObjectId,
      build: s.build,
      takenAt: s.takenAt.toISOString(),
      storagePath: s.storagePath,
      sha256: s.sha256,
      width: s.width,
      height: s.height,
      things: s.things,
      createdAt: s.createdAt.toISOString(),
    })),
    snapshotAnnotations: snapshotAnnotations.map((a) => ({
      id: a.id,
      locationId: a.locationId,
      snapshotId: a.snapshotId,
      kind: a.kind,
      thingKey: a.thingKey,
      region: a.region,
      text: a.text,
      storyObjectId: a.storyObjectId,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}

export function serializeRelationship(r: Relationship) {
  return {
    id: r.id,
    type: r.type,
    label: r.label,
    fromNodeId: r.fromNodeId,
    fromObjectId: r.fromObjectId,
    toNodeId: r.toNodeId,
    toObjectId: r.toObjectId,
    createdAt: r.createdAt.toISOString(),
  };
}

export function serializeGoogleDocExport(e: GoogleDocExport) {
  return {
    id: e.id,
    exportMode: e.exportMode,
    googleDocId: e.googleDocId,
    googleDocUrl: e.googleDocUrl,
    lastSyncedAt: e.lastSyncedAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}
