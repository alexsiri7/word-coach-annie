import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectReadAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { StoryObjectUpdateSchema } from "@/schemas/story-objects";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const storyObject = await prisma.storyObject.findUnique({
      where: { id },
      include: {
        relationships: {
          include: {
            toNode: { select: { id: true, title: true, type: true } },
            toObject: { select: { id: true, name: true, type: true } },
            toWorldObject: { select: { id: true, name: true, type: true } },
          },
        },
        relatedBy: {
          include: {
            fromNode: { select: { id: true, title: true, type: true } },
            fromObject: { select: { id: true, name: true, type: true } },
            fromWorldObject: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    if (!storyObject) {
      return NextResponse.json(
        { error: "Story object not found" },
        { status: 404 }
      );
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectReadAccess(storyObject.projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    return NextResponse.json(storyObject);
  } catch (error) {
    logger.error("GET /api/story-objects/[id] error", error);
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

    // Verify story object exists
    const existing = await prisma.storyObject.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Story object not found" },
        { status: 404 }
      );
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(existing.projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = StoryObjectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, description, notes, role, tags } = parsed.data;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = sanitizeInput(name.trim());
    if (description !== undefined) data.description = sanitizeInput(description);
    if (notes !== undefined) data.notes = sanitizeInput(notes);
    if (role !== undefined) data.role = role !== null ? sanitizeInput(role) : null;
    if (tags !== undefined) data.tags = sanitizeInput(tags);

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const storyObject = await prisma.storyObject.update({
      where: { id },
      data,
    });

    return NextResponse.json(storyObject);
  } catch (error) {
    logger.error("PATCH /api/story-objects/[id] error", error);
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

    const existing = await prisma.storyObject.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Story object not found" },
        { status: 404 }
      );
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(existing.projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    await prisma.storyObject.delete({ where: { id } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("DELETE /api/story-objects/[id] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
