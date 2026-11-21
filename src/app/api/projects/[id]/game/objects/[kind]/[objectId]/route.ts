import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { GameObjectsController } from "@/lib/controllers/game-objects";
import { gameObjectErrorResponse } from "../../errors";

type Params = { params: Promise<{ id: string; kind: string; objectId: string }> };

/** Creates or replaces the object of this kind and id; the body is the whole object, id included. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, kind, objectId } = await params;
    const access = await verifyProjectAccess(id, getCurrentUserId(request));
    if (!access.authorized) return access.response;

    const body: unknown = await request.json().catch(() => null);
    const bodyId = typeof body === "object" && body !== null ? Reflect.get(body, "id") : undefined;
    if (typeof bodyId === "string" && bodyId !== objectId) {
      return NextResponse.json({ error: `The object's id "${bodyId}" does not match the address "${objectId}"` }, { status: 400 });
    }
    return NextResponse.json({ object: await GameObjectsController.save(id, kind, body) });
  } catch (error) {
    return gameObjectErrorResponse("PUT /api/projects/[id]/game/objects/[kind]/[objectId]", error);
  }
}

/** Deletes the object unless other objects use it; `?confirm=true` deletes it anyway. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id, kind, objectId } = await params;
    const access = await verifyProjectAccess(id, getCurrentUserId(request));
    if (!access.authorized) return access.response;

    const confirm = request.nextUrl.searchParams.get("confirm") === "true";
    return NextResponse.json(await GameObjectsController.delete(id, kind, objectId, confirm));
  } catch (error) {
    return gameObjectErrorResponse("DELETE /api/projects/[id]/game/objects/[kind]/[objectId]", error);
  }
}
