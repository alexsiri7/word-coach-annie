import { NextRequest, NextResponse } from "next/server";
import { ProjectsController } from "@/lib/controllers/projects";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess, verifyProjectReadAccess } from "@/lib/api-auth";
import { ProjectUpdateSchema, ProjectDeleteSchema } from "@/schemas/projects";

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
    const parsed = ProjectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const project = await ProjectsController.updateProject(id, parsed.data);
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
// Requires: project must be archived, request body must include confirmTitle matching project title
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
      return NextResponse.json(
        { error: "Project must be archived before it can be deleted" },
        { status: 400 }
      );
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsed = ProjectDeleteSchema.safeParse(rawBody);
    if (!parsed.success || parsed.data.confirmTitle !== project.title) {
      return NextResponse.json(
        { error: "You must type the project title to confirm deletion" },
        { status: 400 }
      );
    }

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
