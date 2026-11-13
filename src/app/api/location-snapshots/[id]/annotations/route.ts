import { NextRequest, NextResponse } from "next/server";
import { validateCsrfHeader } from "@/lib/api-auth";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { SnapshotAnnotationCreateSchema } from "@/schemas/location-snapshots";
import { locationImageErrorResponse } from "@/app/api/location-images/access";
import { verifyLocationSnapshotAccess } from "@/app/api/location-snapshots/access";

/** A note on a region of this snapshot, or a requested change to one of its things' name or description. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = validateCsrfHeader(request);
  if (csrfError) return csrfError;
  try {
    const { id } = await params;
    const denied = await verifyLocationSnapshotAccess(request, id);
    if (denied) return denied;

    const parsed = SnapshotAnnotationCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }
    return NextResponse.json(await LocationSnapshotController.addAnnotation(id, parsed.data), { status: 201 });
  } catch (error) {
    return locationImageErrorResponse("POST /api/location-snapshots/[id]/annotations", error);
  }
}
