import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/projects/[id] - Get a project by ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: {
        select: { structureNodes: true, storyObjects: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

// PATCH /api/projects/[id] - Update a project
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { title, author, synopsis, genre } = body;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const updateData: Record<string, string> = {};
  if (title !== undefined) {
    if (typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    updateData.title = title.trim();
  }
  if (author !== undefined) updateData.author = (author || "").trim();
  if (synopsis !== undefined) updateData.synopsis = (synopsis || "").trim();
  if (genre !== undefined) updateData.genre = (genre || "").trim();

  const project = await prisma.project.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(project);
}

// DELETE /api/projects/[id] - Delete a project (cascades to all children)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ status: "deleted" });
}
