import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
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
          },
        },
        relatedBy: {
          include: {
            fromNode: { select: { id: true, title: true, type: true } },
            fromObject: { select: { id: true, name: true, type: true } },
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
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Story object not found" },
        { status: 404 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { name, description, notes, role, tags } = body as {
      name?: string;
      description?: string;
      notes?: string;
      role?: string | null;
      tags?: string;
    };

    // Validate name if provided
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description;
    if (notes !== undefined) data.notes = notes;
    if (role !== undefined) data.role = role;
    if (tags !== undefined) data.tags = tags;

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.storyObject.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Story object not found" },
        { status: 404 }
      );
    }

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
