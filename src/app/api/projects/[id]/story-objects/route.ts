import { NextRequest, NextResponse } from "next/server";
import { StoryObjectController } from "@/lib/controllers/story-objects";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { StoryObjectCreateSchema } from "@/schemas/story-objects";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectAccess(projectId, userId);
  if (!access.authorized) return access.response;

  try {
    const { searchParams } = request.nextUrl;

    // Extract query params
    const type = searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      200
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") || "0", 10) || 0,
      0
    );

    const result = await StoryObjectController.listStoryObjects({
      projectId,
      type,
      search,
      limit,
      offset
    });

    // The controller returns { objects, total }
    // The API previously returned { data: storyObjects, total, limit, offset }
    // We map `objects` to `data` to maintain API compatibility

    return NextResponse.json({
      data: result.objects,
      total: result.total,
      limit,
      offset,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (message.includes("Invalid type")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logger.error("GET /api/projects/[id]/story-objects error", error);
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
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = StoryObjectCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { type, name, description, notes, role, tags } = parsed.data;
    const storyObject = await StoryObjectController.createStoryObject({
      projectId,
      type,
      name: sanitizeInput(name),
      description: description ? sanitizeInput(description) : undefined,
      notes: notes ? sanitizeInput(notes) : undefined,
      role: role ? sanitizeInput(role) : undefined,
      tags: tags ? sanitizeInput(tags) : undefined,
    });

    return NextResponse.json(storyObject, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (message.includes("name is required") || message.includes("Invalid type") || message.includes("type is required")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logger.error("POST /api/projects/[id]/story-objects error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
