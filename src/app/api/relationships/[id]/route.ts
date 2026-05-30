import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess, verifyUniverseAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";

const VALID_RELATIONSHIP_TYPES = [
  "APPEARS_IN",
  "LOCATED_AT",
  "PART_OF_PLOTLINE",
  "RELATED_TO",
  "INTERACTS_WITH",
  "CONTAINS",
  "PRECEDES",
  "FOLLOWS",
] as const;

async function verifyRelationshipAccess(
  relationshipId: string,
  userId: string | null
): Promise<{ authorized: true } | { authorized: false; response: NextResponse }> {
  const rel = await prisma.relationship.findUnique({
    where: { id: relationshipId },
    select: {
      fromNode: { select: { projectId: true } },
      toNode: { select: { projectId: true } },
      fromObject: { select: { projectId: true } },
      toObject: { select: { projectId: true } },
      fromWorldObject: { select: { universeId: true } },
      toWorldObject: { select: { universeId: true } },
    },
  });

  if (!rel) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Relationship not found" }, { status: 404 }),
    };
  }

  // Check ownership via whichever endpoint exists
  const projectId =
    rel.fromNode?.projectId ||
    rel.toNode?.projectId ||
    rel.fromObject?.projectId ||
    rel.toObject?.projectId;
  if (projectId) {
    const access = await verifyProjectAccess(projectId, userId);
    if (!access.authorized) return access;
    return { authorized: true };
  }

  const universeId =
    rel.fromWorldObject?.universeId ||
    rel.toWorldObject?.universeId;
  if (universeId) {
    const access = await verifyUniverseAccess(universeId, userId);
    if (!access.authorized) return access;
    return { authorized: true };
  }

  // Orphaned relationship — deny by default
  return {
    authorized: false,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyRelationshipAccess(id, userId);
    if (!access.authorized) return access.response;

    const relationship = await prisma.relationship.findUnique({
      where: { id },
      include: {
        fromNode: { select: { id: true, title: true, type: true } },
        fromObject: { select: { id: true, name: true, type: true } },
        toNode: { select: { id: true, title: true, type: true } },
        toObject: { select: { id: true, name: true, type: true } },
      },
    });

    if (!relationship) {
      return NextResponse.json(
        { error: "Relationship not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(relationship);
  } catch (error) {
    logger.error("GET /api/relationships/[id] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyRelationshipAccess(id, userId);
    if (!access.authorized) return access.response;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.warn("PATCH /api/relationships/[id] invalid JSON body", parseError);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { type, label } = body as {
      type?: string;
      label?: string;
    };

    // Validate type if provided
    if (
      type !== undefined &&
      !VALID_RELATIONSHIP_TYPES.includes(
        type as (typeof VALID_RELATIONSHIP_TYPES)[number]
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid type. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (type !== undefined) data.type = type;
    if (label !== undefined) data.label = sanitizeInput(label);

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const relationship = await prisma.relationship.update({
      where: { id },
      data,
      include: {
        fromNode: { select: { id: true, title: true, type: true } },
        fromObject: { select: { id: true, name: true, type: true } },
        toNode: { select: { id: true, title: true, type: true } },
        toObject: { select: { id: true, name: true, type: true } },
      },
    });

    return NextResponse.json(relationship);
  } catch (error) {
    logger.error("PATCH /api/relationships/[id] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyRelationshipAccess(id, userId);
    if (!access.authorized) return access.response;

    await prisma.relationship.delete({ where: { id } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("DELETE /api/relationships/[id] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
