import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
    console.error("GET /api/relationships/[id] error:", error);
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

    const existing = await prisma.relationship.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Relationship not found" },
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
    if (label !== undefined) data.label = label;

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
    console.error("PATCH /api/relationships/[id] error:", error);
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

    const existing = await prisma.relationship.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Relationship not found" },
        { status: 404 }
      );
    }

    await prisma.relationship.delete({ where: { id } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/relationships/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
