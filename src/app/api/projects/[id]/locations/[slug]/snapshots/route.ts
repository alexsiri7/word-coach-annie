import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, validateCsrfHeader, verifyProjectAccess } from "@/lib/api-auth";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import { MAX_IMAGE_BYTES } from "@/lib/location-images/process";
import { locationSlugs } from "@/lib/location-snapshots/slug";
import { SnapshotIngestFieldsSchema, SnapshotThingsSchema, type SnapshotThing } from "@/schemas/location-snapshots";
import { locationImageErrorResponse } from "@/app/api/location-images/access";

type Params = { params: Promise<{ id: string; slug: string }> };

const MAX_THINGS_JSON_BYTES = 1024 * 1024;

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function parseThingsField(value: FormDataEntryValue | null | undefined): { things: SnapshotThing[] } | { error: string } {
  if (typeof value !== "string") return { error: "things must be a JSON array" };
  if (Buffer.byteLength(value) > MAX_THINGS_JSON_BYTES) return { error: "things is larger than 1 MB" };
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return { error: "things must be a JSON array" };
  }
  const parsed = SnapshotThingsSchema.safeParse(json);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid things" };
  return { things: parsed.data };
}

/**
 * A game's screenshot of a location, as multipart/form-data: `file`, `build`, `takenAt`
 * and `things` (a JSON array). The location is named by the story-sync export's slug.
 * Posting the latest snapshot again changes nothing and answers 200 instead of 201.
 */
export async function POST(request: NextRequest, { params }: Params) {
  // x-token-scope is set only by the proxy, so a snapshots token is a bearer credential
  // that a cross-site form cannot send; any other caller needs the CSRF header.
  if (request.headers.get("x-token-scope") !== "snapshots") {
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;
  }
  try {
    const { id: projectId, slug } = await params;
    const access = await verifyProjectAccess(projectId, getCurrentUserId(request));
    if (!access.authorized) return access.response;

    const locations = await prisma.storyObject.findMany({
      where: { projectId, type: "LOCATION" },
      select: { id: true, name: true },
    });
    const slugs = locationSlugs(locations);
    const locationId = slugs.get(slug);
    if (!locationId) {
      return NextResponse.json({ error: "Unknown location", knownSlugs: [...slugs.keys()].sort() }, { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return badRequest("Attach the screenshot as file");
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is larger than 20 MB" }, { status: 413 });
    }
    const fields = SnapshotIngestFieldsSchema.safeParse({
      build: form?.get("build") ?? undefined,
      takenAt: form?.get("takenAt") ?? undefined,
    });
    if (!fields.success) return badRequest(fields.error.issues[0]?.message ?? "Invalid build or takenAt");
    const things = parseThingsField(form?.get("things"));
    if ("error" in things) return badRequest(things.error);

    const { created, snapshot } = await LocationSnapshotController.ingest(
      locationId,
      projectId,
      Buffer.from(await file.arrayBuffer()),
      { ...fields.data, things: things.things },
    );
    return NextResponse.json(
      { created, snapshot: { ...snapshot, imageUrl: `/api/location-snapshots/${snapshot.id}/file` } },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    return locationImageErrorResponse("POST /api/projects/[id]/locations/[slug]/snapshots", error);
  }
}
