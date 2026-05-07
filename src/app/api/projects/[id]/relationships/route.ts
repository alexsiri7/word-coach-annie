import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { RelationshipCreateSchema } from "@/schemas/relationships";


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectAccess(projectId, userId);
  if (!access.authorized) return access.response;

  try {

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Get all node IDs and object IDs that belong to this project
    const [nodes, objects] = await Promise.all([
      prisma.structureNode.findMany({
        where: { projectId },
        select: { id: true },
      }),
      prisma.storyObject.findMany({
        where: { projectId },
        select: { id: true },
      }),
    ]);

    const nodeIds = nodes.map((n) => n.id);
    const objectIds = objects.map((o) => o.id);

    // Find relationships where either the from or to side belongs to this project
    const relationships = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromNodeId: { in: nodeIds } },
          { fromObjectId: { in: objectIds } },
          { toNodeId: { in: nodeIds } },
          { toObjectId: { in: objectIds } },
        ],
      },
      include: {
        fromNode: { select: { id: true, title: true, type: true } },
        fromObject: { select: { id: true, name: true, type: true } },
        toNode: { select: { id: true, title: true, type: true } },
        toObject: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: relationships });
  } catch (error) {
    logger.error("GET /api/projects/[id]/relationships error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    if (rawBody === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = RelationshipCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { type, label, fromNodeId, fromObjectId, toNodeId, toObjectId } = parsed.data;

    // Verify referenced entities exist and belong to the project
    if (fromNodeId) {
      const node = await prisma.structureNode.findFirst({
        where: { id: fromNodeId, projectId },
        select: { id: true },
      });
      if (!node) {
        return NextResponse.json(
          { error: "fromNodeId not found in this project" },
          { status: 404 }
        );
      }
    }

    if (fromObjectId) {
      const obj = await prisma.storyObject.findFirst({
        where: { id: fromObjectId, projectId },
        select: { id: true },
      });
      if (!obj) {
        return NextResponse.json(
          { error: "fromObjectId not found in this project" },
          { status: 404 }
        );
      }
    }

    if (toNodeId) {
      const node = await prisma.structureNode.findFirst({
        where: { id: toNodeId, projectId },
        select: { id: true },
      });
      if (!node) {
        return NextResponse.json(
          { error: "toNodeId not found in this project" },
          { status: 404 }
        );
      }
    }

    if (toObjectId) {
      const obj = await prisma.storyObject.findFirst({
        where: { id: toObjectId, projectId },
        select: { id: true },
      });
      if (!obj) {
        return NextResponse.json(
          { error: "toObjectId not found in this project" },
          { status: 404 }
        );
      }
    }

    const relationship = await prisma.relationship.create({
      data: {
        type,
        ...(label !== undefined && { label: sanitizeInput(label) }),
        ...(fromNodeId && { fromNodeId }),
        ...(fromObjectId && { fromObjectId }),
        ...(toNodeId && { toNodeId }),
        ...(toObjectId && { toObjectId }),
      },
      include: {
        fromNode: { select: { id: true, title: true, type: true } },
        fromObject: { select: { id: true, name: true, type: true } },
        toNode: { select: { id: true, title: true, type: true } },
        toObject: { select: { id: true, name: true, type: true } },
      },
    });

    return NextResponse.json(relationship, { status: 201 });
  } catch (error) {
    logger.error("POST /api/projects/[id]/relationships error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
