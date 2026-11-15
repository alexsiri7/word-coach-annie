import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { GameObjectsController } from "@/lib/controllers/game-objects";
import { gameObjectErrorResponse } from "./errors";

type Params = { params: Promise<{ id: string }> };

/** A GAME project's objects of the kind in `?kind=`, in the order they were added. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const access = await verifyProjectAccess(id, getCurrentUserId(request));
    if (!access.authorized) return access.response;

    const kind = request.nextUrl.searchParams.get("kind") ?? "";
    return NextResponse.json({ objects: await GameObjectsController.list(id, kind) });
  } catch (error) {
    return gameObjectErrorResponse("GET /api/projects/[id]/game/objects", error);
  }
}
