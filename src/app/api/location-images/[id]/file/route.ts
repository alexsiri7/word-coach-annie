import { NextRequest, NextResponse } from "next/server";
import { LocationImageController } from "@/lib/controllers/location-images";
import { locationImageErrorResponse, verifyLocationImageAccess } from "@/app/api/location-images/access";

/**
 * A stable URL for <img> tags that redirects to a fresh signed storage URL. The
 * browser caches the redirect for 50 minutes (inside the signed URL's hour), and
 * the storage object itself for a year, so a thumbnail costs storage egress
 * about once per session rather than once per render.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const variant = request.nextUrl.searchParams.get("variant") ?? "thumb";
    if (variant !== "thumb" && variant !== "full") {
      return NextResponse.json({ error: "variant must be thumb or full" }, { status: 400 });
    }
    const denied = await verifyLocationImageAccess(request, id);
    if (denied) return denied;

    const response = NextResponse.redirect(await LocationImageController.signedUrl(id, variant), 302);
    response.headers.set("Cache-Control", "private, max-age=3000");
    return response;
  } catch (error) {
    return locationImageErrorResponse("GET /api/location-images/[id]/file", error);
  }
}
