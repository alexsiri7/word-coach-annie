import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, validateCsrfHeader, verifyProjectAccess } from "@/lib/api-auth";
import { LocationImageController } from "@/lib/controllers/location-images";
import { MAX_IMAGE_BYTES } from "@/lib/location-images/process";
import { LocationImageCaptionSchema, LocationImageKindSchema } from "@/schemas/location-images";
import { locationImageErrorResponse } from "@/app/api/location-images/access";

type Params = { params: Promise<{ id: string }> };

async function verifyStoryObjectAccess(request: NextRequest, id: string): Promise<NextResponse | null> {
  const storyObject = await prisma.storyObject.findUnique({ where: { id }, select: { projectId: true } });
  if (!storyObject) return NextResponse.json({ error: "Story object not found" }, { status: 404 });
  const access = await verifyProjectAccess(storyObject.projectId, getCurrentUserId(request));
  return access.authorized ? null : access.response;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const denied = await verifyStoryObjectAccess(request, id);
    if (denied) return denied;

    const images = await LocationImageController.list(id);
    return NextResponse.json({
      data: images.map((image) => ({
        ...image,
        thumbUrl: `/api/location-images/${image.id}/file?variant=thumb`,
        fullUrl: `/api/location-images/${image.id}/file?variant=full`,
      })),
    });
  } catch (error) {
    return locationImageErrorResponse("GET /api/story-objects/[id]/images", error);
  }
}

/** multipart/form-data: `file`, optional `kind` and `caption`. */
export async function POST(request: NextRequest, { params }: Params) {
  // A multipart POST is a CORS simple request, so it needs the CSRF header.
  const csrfError = validateCsrfHeader(request);
  if (csrfError) return csrfError;
  try {
    const { id } = await params;
    const denied = await verifyStoryObjectAccess(request, id);
    if (denied) return denied;

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach an image file" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is larger than 20 MB" }, { status: 413 });
    }
    const kind = LocationImageKindSchema.optional().safeParse(form?.get("kind") ?? undefined);
    const caption = LocationImageCaptionSchema.optional().safeParse(form?.get("caption") ?? undefined);
    if (!kind.success || !caption.success) {
      return NextResponse.json({ error: "Invalid kind or caption" }, { status: 400 });
    }

    const image = await LocationImageController.add(id, Buffer.from(await file.arrayBuffer()), {
      kind: kind.data,
      caption: caption.data,
    });
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    return locationImageErrorResponse("POST /api/story-objects/[id]/images", error);
  }
}
