import type { Opportunity, Provider, WritingTask } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serializeGoogleDocExport, serializeRelationship } from "@/lib/export-json";

// Account data for the GDPR export only. Kept out of exportProjectJson, whose
// output also feeds the single-project download, export-all and import — share
// rows carry other people's email addresses and don't belong in those.

export async function exportProjectAccountData(project: { id: string; universeId: string | null }) {
  const projectId = project.id;
  const [
    shares, peerReviews, writingTasks,
    contestSubmissions, publicationSubmissions, opportunityCandidates,
  ] = await Promise.all([
    prisma.projectShare.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.peerReview.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.writingTask.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.contestSubmission.findMany({ where: { projectId }, orderBy: { submissionDate: "asc" } }),
    prisma.publicationSubmission.findMany({ where: { projectId }, orderBy: { submissionDate: "asc" } }),
    prisma.opportunityCandidate.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    universeId: project.universeId,
    shares: shares.map((s) => ({
      id: s.id,
      email: s.email,
      role: s.role,
      createdAt: s.createdAt.toISOString(),
    })),
    peerReviews: peerReviews.map((r) => ({
      id: r.id,
      publisher: r.publisher,
      reader: r.reader,
      writer: r.writer,
      comedy: r.comedy,
      actor: r.actor,
      consensus: r.consensus,
      createdAt: r.createdAt.toISOString(),
    })),
    writingTasks: writingTasks.map(serializeWritingTask),
    contestSubmissions: contestSubmissions.map((s) => ({
      id: s.id,
      providerId: s.providerId,
      contestName: s.contestName,
      submissionDate: s.submissionDate.toISOString(),
      reviewDate: s.reviewDate?.toISOString() ?? null,
      submissionUrl: s.submissionUrl,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    publicationSubmissions: publicationSubmissions.map((s) => ({
      id: s.id,
      venueName: s.venueName,
      submissionDate: s.submissionDate.toISOString(),
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    opportunityCandidates: opportunityCandidates.map((c) => ({
      id: c.id,
      opportunityId: c.opportunityId,
      state: c.state,
      notes: c.notes,
      submissionId: c.submissionId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}

export async function exportUniverseJson(universeId: string) {
  const [universe, worldObjects, relationships, googleDocExports] = await Promise.all([
    prisma.universe.findUnique({ where: { id: universeId } }),
    prisma.worldObject.findMany({
      where: { universeId },
      include: { timeline: { orderBy: { orderIndex: "asc" } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.relationship.findMany({
      where: {
        OR: [{ fromWorldObject: { universeId } }, { toWorldObject: { universeId } }],
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.googleDocExport.findMany({ where: { universeId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!universe) throw new Error(`Universe not found: ${universeId}`);

  return {
    universe: {
      id: universe.id,
      title: universe.title,
      description: universe.description,
      createdAt: universe.createdAt.toISOString(),
      updatedAt: universe.updatedAt.toISOString(),
    },
    worldObjects: worldObjects.map((o) => ({
      id: o.id,
      type: o.type,
      name: o.name,
      description: o.description,
      notes: o.notes,
      tags: o.tags,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      timeline: o.timeline.map((t) => ({
        id: t.id,
        label: t.label,
        orderIndex: t.orderIndex,
        description: t.description,
        attributes: t.attributes,
        projectId: t.projectId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    })),
    relationships: relationships.map((r) => ({
      ...serializeRelationship(r),
      fromWorldObjectId: r.fromWorldObjectId,
      toWorldObjectId: r.toWorldObjectId,
    })),
    googleDocExports: googleDocExports.map(serializeGoogleDocExport),
  };
}

export function serializeProvider(p: Provider) {
  return {
    id: p.id,
    name: p.name,
    website: p.website,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeOpportunity(o: Opportunity) {
  return {
    id: o.id,
    providerId: o.providerId,
    title: o.title,
    closeDate: o.closeDate.toISOString(),
    reviewDate: o.reviewDate?.toISOString() ?? null,
    rulesUrl: o.rulesUrl,
    entryFee: o.entryFee,
    wordLimit: o.wordLimit,
    lineLimit: o.lineLimit,
    genreRestrictions: o.genreRestrictions,
    eligibilityNotes: o.eligibilityNotes,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function serializeWritingTask(t: WritingTask) {
  return {
    id: t.id,
    projectId: t.projectId,
    sceneId: t.sceneId,
    name: t.name,
    whatIsNeeded: t.whatIsNeeded,
    importance: t.importance,
    size: t.size,
    energy: t.energy,
    kind: t.kind,
    capacity: t.capacity,
    dueDate: t.dueDate?.toISOString() ?? null,
    completed: t.completed,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
