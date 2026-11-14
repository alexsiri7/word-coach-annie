import { NextRequest, NextResponse } from "next/server";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { locationImageErrorResponse, verifyStoryObjectAccess } from "@/app/api/location-images/access";

/** A location's snapshots (newest first, without things) and all of its annotations. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const denied = await verifyStoryObjectAccess(request, id);
    if (denied) return denied;

    const { snapshots, annotations } = await LocationSnapshotController.list(id);
    return NextResponse.json({ data: snapshots, annotations });
  } catch (error) {
    return locationImageErrorResponse("GET /api/story-objects/[id]/snapshots", error);
  }
}
