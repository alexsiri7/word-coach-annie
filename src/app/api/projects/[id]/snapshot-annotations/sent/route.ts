import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, validateCsrfHeader, verifyProjectAccess } from "@/lib/api-auth";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { SnapshotAnnotationsSentSchema } from "@/schemas/location-snapshots";
import { locationImageErrorResponse } from "@/app/api/location-images/access";

type Params = { params: Promise<{ id: string }> };

/** Marks the listed open annotations of the project sent: `{ "ids": [...] }`. */
export async function POST(request: NextRequest, { params }: Params) {
  // x-token-scope is set only by the proxy, so a mark-sent token is a bearer credential
  // that a cross-site form cannot send; any other caller needs the CSRF header.
  if (request.headers.get("x-token-scope") !== "mark-sent") {
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;
  }
  try {
    const { id: projectId } = await params;
    const access = await verifyProjectAccess(projectId, getCurrentUserId(request));
    if (!access.authorized) return access.response;

    const parsed = SnapshotAnnotationsSentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }
    return NextResponse.json(await LocationSnapshotController.markAnnotationsSent(projectId, parsed.data.ids));
  } catch (error) {
    return locationImageErrorResponse("POST /api/projects/[id]/snapshot-annotations/sent", error);
  }
}
