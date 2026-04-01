import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";

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

    if (userId) {
      const activeCount = await prisma.project.count({
        where: { userId, archivedAt: null },
      });
      if (activeCount >= 3) {
        return NextResponse.json(
          {
            error: "Free accounts are limited to 3 active projects. Archive or delete an existing project before restoring this one.",
            code: "PROJECT_LIMIT_REACHED",
          },
          { status: 403 }
        );
      }
    }

    await prisma.project.update({
      where: { id },
      data: { archivedAt: null },
    });

    return NextResponse.json({ status: "unarchived" });
  } catch (error) {
    logger.error("DELETE /api/projects/[id]/archive error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
