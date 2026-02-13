import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const VALID_TYPES = [
  "CHARACTER",
  "LOCATION",
  "PLOTLINE",
  "WORLD_ELEMENT",
  "NOTE",
] as const;

type StoryObjectType = (typeof VALID_TYPES)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      200
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") || "0", 10) || 0,
      0
    );
    const search = searchParams.get("search");

    // Validate type filter if provided
    if (type && !VALID_TYPES.includes(type as StoryObjectType)) {
      return NextResponse.json(
        {
          error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

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

    const where: Record<string, unknown> = { projectId };

    if (type) {
      where.type = type;
    }

    if (search) {
      where.name = { contains: search };
    }

    const [storyObjects, total] = await Promise.all([
      prisma.storyObject.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.storyObject.count({ where }),
    ]);

    return NextResponse.json({
      data: storyObjects,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/story-objects error:", error);
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
  try {
    const { id: projectId } = await params;

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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { type, name, description, notes, role, tags } = body as {
      type?: string;
      name?: string;
      description?: string;
      notes?: string;
      role?: string;
      tags?: string;
    };

    // Validate required fields
    if (!type) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type as StoryObjectType)) {
      return NextResponse.json(
        {
          error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const storyObject = await prisma.storyObject.create({
      data: {
        projectId,
        type,
        name: name.trim(),
        ...(description !== undefined && { description }),
        ...(notes !== undefined && { notes }),
        ...(role !== undefined && { role }),
        ...(tags !== undefined && { tags }),
      },
    });

    return NextResponse.json(storyObject, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[id]/story-objects error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
