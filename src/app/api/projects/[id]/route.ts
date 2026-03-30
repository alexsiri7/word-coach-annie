import { NextRequest, NextResponse } from "next/server";
import { ProjectsController } from "@/lib/controllers/projects";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess, verifyProjectReadAccess } from "@/lib/api-auth";

// GET /api/projects/[id] - Get a project by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectReadAccess(id, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const project = await ProjectsController.getProject(id);
    return NextResponse.json(project);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    logger.error("GET /api/projects/[id] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id] - Update a project
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    const body = await request.json();
    const project = await ProjectsController.updateProject(id, body);
    return NextResponse.json(project);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (message.includes("No fields to update")) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    logger.error("PATCH /api/projects/[id] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete a project (cascades to all children)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    logger.error("DELETE /api/projects/[id] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
