import { NextRequest, NextResponse } from "next/server";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { SnapshotAnnotationUpdateSchema } from "@/schemas/location-snapshots";
import { locationImageErrorResponse } from "@/app/api/location-images/access";
import { verifySnapshotAnnotationAccess } from "@/app/api/location-snapshots/access";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifySnapshotAnnotationAccess(request, id);
    if (denied) return denied;

    const parsed = SnapshotAnnotationUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }
    return NextResponse.json(await LocationSnapshotController.updateAnnotation(id, parsed.data));
  } catch (error) {
    return locationImageErrorResponse("PATCH /api/snapshot-annotations/[id]", error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifySnapshotAnnotationAccess(request, id);
    if (denied) return denied;

    return NextResponse.json(await LocationSnapshotController.deleteAnnotation(id));
  } catch (error) {
    return locationImageErrorResponse("DELETE /api/snapshot-annotations/[id]", error);
  }
}
