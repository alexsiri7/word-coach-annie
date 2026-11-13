import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { LocationMapController } from "@/lib/controllers/location-maps";
import { NotFoundError, UserFacingError } from "@/lib/controllers/errors";
import { logger } from "@/lib/logger";
import { describeLocationMapError, LocationMapInputSchema } from "@/schemas/location-map";

type Params = { params: Promise<{ id: string }> };

/** Maps are owner-only like location images, whose files a map's background shows. */
async function verifyStoryObjectAccess(request: NextRequest, id: string): Promise<NextResponse | null> {
  const storyObject = await prisma.storyObject.findUnique({ where: { id }, select: { projectId: true } });
  if (!storyObject) return NextResponse.json({ error: "Story object not found" }, { status: 404 });
  const access = await verifyProjectAccess(storyObject.projectId, getCurrentUserId(request));
  return access.authorized ? null : access.response;
}

function errorResponse(label: string, error: unknown): NextResponse {
  if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: 400 });
  logger.error(`${label} error`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifyStoryObjectAccess(request, id);
    if (denied) return denied;

    return NextResponse.json({ data: await LocationMapController.get(id) });
  } catch (error) {
    return errorResponse("GET /api/story-objects/[id]/map", error);
  }
}

/** Creates or replaces the whole map; the last write wins. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifyStoryObjectAccess(request, id);
    if (denied) return denied;

    const parsed = LocationMapInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: describeLocationMapError(parsed.error) }, { status: 400 });
    }
    return NextResponse.json({ data: await LocationMapController.set(id, parsed.data) });
  } catch (error) {
    return errorResponse("PUT /api/story-objects/[id]/map", error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifyStoryObjectAccess(request, id);
    if (denied) return denied;

    return NextResponse.json(await LocationMapController.delete(id));
  } catch (error) {
    return errorResponse("DELETE /api/story-objects/[id]/map", error);
  }
}
