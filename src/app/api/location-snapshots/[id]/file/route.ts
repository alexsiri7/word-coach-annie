import { NextRequest, NextResponse } from "next/server";
import { IMAGE_FILE_CACHE_SECONDS } from "@/lib/controllers/location-images";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { locationImageErrorResponse } from "@/app/api/location-images/access";
import { verifyLocationSnapshotAccess } from "@/app/api/location-snapshots/access";

/** A stable <img> URL that redirects to a fresh signed storage URL, like location image files. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const denied = await verifyLocationSnapshotAccess(request, id);
    if (denied) return denied;

    const response = NextResponse.redirect(await LocationSnapshotController.signedUrl(id), 302);
    response.headers.set("Cache-Control", `private, max-age=${IMAGE_FILE_CACHE_SECONDS}`);
    return response;
  } catch (error) {
    return locationImageErrorResponse("GET /api/location-snapshots/[id]/file", error);
  }
}
