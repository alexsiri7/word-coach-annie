import { NextRequest, NextResponse } from "next/server";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { locationImageErrorResponse } from "@/app/api/location-images/access";
import { verifyLocationSnapshotAccess } from "@/app/api/location-snapshots/access";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const denied = await verifyLocationSnapshotAccess(request, id);
    if (denied) return denied;

    const snapshot = await LocationSnapshotController.get(id);
    return NextResponse.json({ ...snapshot, imageUrl: `/api/location-snapshots/${id}/file` });
  } catch (error) {
    return locationImageErrorResponse("GET /api/location-snapshots/[id]", error);
  }
}
