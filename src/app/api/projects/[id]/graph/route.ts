import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const [structureNodes, storyObjects] = await Promise.all([
      prisma.structureNode.findMany({
        where: { projectId },
        select: { id: true, title: true, type: true },
      }),
      prisma.storyObject.findMany({
        where: { projectId },
        select: { id: true, name: true, type: true },
      }),
    ]);

    const nodeIds = structureNodes.map((n) => n.id);
    const objectIds = storyObjects.map((o) => o.id);

    const relationships = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromNodeId: { in: nodeIds } },
          { fromObjectId: { in: objectIds } },
          { toNodeId: { in: nodeIds } },
          { toObjectId: { in: objectIds } },
        ],
      },
      select: {
        id: true,
        type: true,
        label: true,
        fromNodeId: true,
        fromObjectId: true,
        toNodeId: true,
        toObjectId: true,
      },
    });

    const nodes = [
      ...structureNodes.map((n) => ({
        id: n.id,
        label: n.title,
        type: "structureNode" as const,
        entityType: n.type,
      })),
      ...storyObjects.map((o) => ({
        id: o.id,
        label: o.name,
        type: "storyObject" as const,
        entityType: o.type,
      })),
    ];

    const edges = relationships.map((r) => ({
      id: r.id,
      source: r.fromNodeId ?? r.fromObjectId ?? "",
      target: r.toNodeId ?? r.toObjectId ?? "",
      type: r.type,
      label: r.label,
    }));

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    logger.error("GET /api/projects/[id]/graph error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
