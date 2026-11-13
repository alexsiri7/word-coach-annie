import { NextRequest, NextResponse } from "next/server";
import { LocationImageController } from "@/lib/controllers/location-images";
import { LocationImageUpdateSchema } from "@/schemas/location-images";
import { locationImageErrorResponse, verifyLocationImageAccess } from "@/app/api/location-images/access";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifyLocationImageAccess(request, id);
    if (denied) return denied;

    const parsed = LocationImageUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }
    return NextResponse.json(await LocationImageController.update(id, parsed.data));
  } catch (error) {
    return locationImageErrorResponse("PATCH /api/location-images/[id]", error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifyLocationImageAccess(request, id);
    if (denied) return denied;

    return NextResponse.json(await LocationImageController.delete(id));
  } catch (error) {
    return locationImageErrorResponse("DELETE /api/location-images/[id]", error);
  }
}
