import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { isSerializationConflict } from "@/lib/controllers/serializable";
import { ActiveProjectLimitError, assertActiveProjectLimit } from "@/lib/project-limit";

// POST /api/projects/[id]/archive - Archive a project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.archivedAt) {
      return NextResponse.json({ error: "Project is already archived" }, { status: 400 });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ status: "archived", archivedAt: updated.archivedAt });
  } catch (error) {
    logger.error("POST /api/projects/[id]/archive error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/archive - Unarchive a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!project.archivedAt) {
      return NextResponse.json({ error: "Project is not archived" }, { status: 400 });
    }

    await prisma.$transaction(
      async (tx) => {
        await assertActiveProjectLimit(tx, userId);
        await tx.project.update({
          where: { id },
          data: { archivedAt: null },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({ status: "unarchived" });
  } catch (error) {
    if (error instanceof ActiveProjectLimitError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (isSerializationConflict(error)) {
      return NextResponse.json(
        { error: "Request conflict, please try again." },
        { status: 409 }
      );
    }
    logger.error("DELETE /api/projects/[id]/archive error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
