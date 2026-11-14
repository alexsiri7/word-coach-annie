import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db";
import { sanitizeInput } from "@/lib/sanitize-server";
import { NotFoundError, UserFacingError } from "@/lib/controllers/errors";
import { runSerializable } from "@/lib/controllers/serializable";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/controllers/location-images";
import { processLocationImage } from "@/lib/location-images/process";
import { purgeImageFiles } from "@/lib/location-images/files";
import { createSignedUrl, uploadObject } from "@/lib/storage/supabase-storage";
import {
    SnapshotAnnotationKindSchema,
    SnapshotThingsSchema,
    annotationTextSchema,
    canonicalThings,
    type SnapshotAnnotationCreateInput,
    type SnapshotAnnotationUpdateInput,
    type SnapshotThing,
} from "@/schemas/location-snapshots";

/** The issue's retention: older snapshots are deleted, their annotations kept as text. */
export const MAX_SNAPSHOTS_PER_LOCATION = 10;

/** "Latest" means latest received: the game's takenAt clock is not trusted for retention. */
const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.LocationSnapshotOrderByWithRelationInput[];

/** Storage paths stay server-side: no API or MCP response carries them. */
const publicFields = {
    id: true,
    storyObjectId: true,
    build: true,
    takenAt: true,
    sha256: true,
    width: true,
    height: true,
    things: true,
    createdAt: true,
} satisfies Prisma.LocationSnapshotSelect;

type SnapshotRow = Prisma.LocationSnapshotGetPayload<{ select: typeof publicFields }>;

export type LocationSnapshot = Omit<SnapshotRow, "things"> & { things: SnapshotThing[] };
export type LocationSnapshotSummary = Omit<SnapshotRow, "things" | "sha256" | "storyObjectId"> & { thingCount: number };
export type SnapshotAnnotation = Prisma.SnapshotAnnotationGetPayload<object>;

export interface IngestInput {
    build: string;
    takenAt: Date;
    things: SnapshotThing[];
}

function parseThings(stored: Prisma.JsonValue): SnapshotThing[] {
    return canonicalThings(SnapshotThingsSchema.parse(stored));
}

function toPublic(row: SnapshotRow): LocationSnapshot {
    return { ...row, things: parseThings(row.things) };
}

function isSameUpload(row: SnapshotRow, sha256: string, things: SnapshotThing[]): boolean {
    return row.sha256 === sha256 && JSON.stringify(parseThings(row.things)) === JSON.stringify(things);
}

function latestRow(db: DbClient, storyObjectId: string) {
    return db.locationSnapshot.findFirst({ where: { storyObjectId }, orderBy: newestFirst, select: publicFields });
}

/** Annotation text was stored through sanitizeInput, so the game's text is compared in the same form. */
function normalizeText(text: string): string {
    return sanitizeInput(text).replace(/\s+/g, " ").trim();
}

/** A requested name or description change is done once a snapshot carries that text. */
async function markEditsDone(tx: DbClient, locationId: string, things: SnapshotThing[]): Promise<void> {
    const byKey = new Map(things.map((t) => [t.key, t]));
    const pending = await tx.snapshotAnnotation.findMany({
        where: {
            locationId,
            kind: { in: ["description", "name"] },
            status: { in: ["open", "sent"] },
            thingKey: { in: [...byKey.keys()] },
        },
        select: { id: true, kind: true, thingKey: true, text: true },
    });
    const done = pending.filter((edit) => {
        const thing = byKey.get(edit.thingKey!)!;
        const current = edit.kind === "name" ? thing.name : thing.description;
        return normalizeText(current) === normalizeText(edit.text);
    });
    if (done.length > 0) {
        await tx.snapshotAnnotation.updateMany({ where: { id: { in: done.map((e) => e.id) } }, data: { status: "done" } });
    }
}

/** Deletes snapshots beyond the newest few and returns their storage paths; their annotations stay (SetNull). */
async function pruneOldSnapshots(tx: DbClient, storyObjectId: string): Promise<string[]> {
    const stale = await tx.locationSnapshot.findMany({
        where: { storyObjectId },
        orderBy: newestFirst,
        skip: MAX_SNAPSHOTS_PER_LOCATION,
        select: { id: true, storagePath: true },
    });
    if (stale.length > 0) {
        await tx.locationSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
    return stale.map((s) => s.storagePath);
}

async function assertLinkable(storyObjectId: string, projectId: string): Promise<void> {
    const linked = await prisma.storyObject.findFirst({ where: { id: storyObjectId, projectId }, select: { id: true } });
    if (!linked) throw new UserFacingError("Linked story object must be in this project");
}

function serializable<T>(target: Record<string, string>, fn: (tx: DbClient) => Promise<T>): Promise<T> {
    return runSerializable(
        "Location snapshot write conflict (P2034)",
        "This location's snapshots changed at the same time; please try again",
        target,
        fn,
    );
}

export class LocationSnapshotController {
    /**
     * Stores a game's screenshot of a location. An upload identical to the latest
     * snapshot (same file bytes and things) is a no-op and decodes nothing.
     */
    static async ingest(
        locationId: string,
        projectId: string,
        file: Buffer,
        input: IngestInput,
    ): Promise<{ created: boolean; snapshot: LocationSnapshot }> {
        const sha256 = createHash("sha256").update(file).digest("hex");
        const things = canonicalThings(input.things);

        const latest = await latestRow(prisma, locationId);
        if (latest && isSameUpload(latest, sha256, things)) return { created: false, snapshot: toPublic(latest) };

        const image = await processLocationImage(file);
        const storagePath = `${projectId}/${locationId}/snapshots/${randomUUID()}.webp`;
        await uploadObject(storagePath, image.full, "image/webp");

        let outcome: { created: boolean; row: SnapshotRow; pruned: string[] };
        try {
            outcome = await serializable({ locationId }, async (tx) => {
                const current = await latestRow(tx, locationId);
                if (current && isSameUpload(current, sha256, things)) return { created: false, row: current, pruned: [] };

                const row = await tx.locationSnapshot.create({
                    data: {
                        storyObjectId: locationId,
                        build: input.build,
                        takenAt: input.takenAt,
                        storagePath,
                        sha256,
                        width: image.sourceWidth,
                        height: image.sourceHeight,
                        things,
                    },
                    select: publicFields,
                });
                await markEditsDone(tx, locationId, things);
                return { created: true, row, pruned: await pruneOldSnapshots(tx, locationId) };
            });
        } catch (e) {
            await purgeImageFiles([storagePath]);
            throw e;
        }
        await purgeImageFiles(outcome.created ? outcome.pruned : [storagePath]);
        return { created: outcome.created, snapshot: toPublic(outcome.row) };
    }

    /** Summaries newest first, plus every annotation on the location (including those whose snapshot was pruned). */
    static async list(locationId: string): Promise<{ snapshots: LocationSnapshotSummary[]; annotations: SnapshotAnnotation[] }> {
        const [rows, annotations] = await Promise.all([
            prisma.locationSnapshot.findMany({ where: { storyObjectId: locationId }, orderBy: newestFirst, select: publicFields }),
            prisma.snapshotAnnotation.findMany({ where: { locationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
        ]);
        const snapshots = rows.map(({ things, sha256: _sha256, storyObjectId: _storyObjectId, ...summary }) => ({
            ...summary,
            thingCount: Array.isArray(things) ? things.length : 0,
        }));
        return { snapshots, annotations };
    }

    static async get(snapshotId: string): Promise<LocationSnapshot> {
        const row = await prisma.locationSnapshot.findUnique({ where: { id: snapshotId }, select: publicFields });
        if (!row) throw new NotFoundError("Location snapshot not found");
        return toPublic(row);
    }

    static async latestId(locationId: string): Promise<string> {
        const row = await prisma.locationSnapshot.findFirst({
            where: { storyObjectId: locationId },
            orderBy: newestFirst,
            select: { id: true },
        });
        if (!row) throw new NotFoundError("This location has no snapshots yet");
        return row.id;
    }

    /** Notes on this snapshot, plus every name/description request on its location. */
    static async reviewAnnotations(snapshot: LocationSnapshot): Promise<SnapshotAnnotation[]> {
        return prisma.snapshotAnnotation.findMany({
            where: {
                locationId: snapshot.storyObjectId,
                OR: [{ snapshotId: snapshot.id, kind: "note" }, { kind: { in: ["description", "name"] } }],
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
    }

    static async signedUrl(snapshotId: string): Promise<string> {
        const row = await prisma.locationSnapshot.findUnique({ where: { id: snapshotId }, select: { storagePath: true } });
        if (!row) throw new NotFoundError("Location snapshot not found");
        return createSignedUrl(row.storagePath, SIGNED_URL_TTL_SECONDS);
    }

    /**
     * A name or description request replaces the thing's open request, so a thing
     * has at most one pending change per field; a sent one is left for the export.
     */
    static async addAnnotation(snapshotId: string, input: SnapshotAnnotationCreateInput): Promise<SnapshotAnnotation> {
        const snapshot = await prisma.locationSnapshot.findUnique({
            where: { id: snapshotId },
            select: { storyObjectId: true, things: true, storyObject: { select: { projectId: true } } },
        });
        if (!snapshot) throw new NotFoundError("Location snapshot not found");
        const locationId = snapshot.storyObjectId;
        const text = sanitizeInput(input.text);

        if (input.kind === "note") {
            if (input.storyObjectId) await assertLinkable(input.storyObjectId, snapshot.storyObject.projectId);
            return prisma.snapshotAnnotation.create({
                data: {
                    locationId,
                    snapshotId,
                    kind: "note",
                    text,
                    region: input.region,
                    thingKey: input.thingKey ?? null,
                    storyObjectId: input.storyObjectId ?? null,
                },
            });
        }

        const thingKey = input.thingKey;
        if (!parseThings(snapshot.things).some((t) => t.key === thingKey)) {
            throw new UserFacingError("This snapshot has no thing with that key");
        }
        return serializable({ snapshotId }, async (tx) => {
            const open = await tx.snapshotAnnotation.findFirst({
                where: { locationId, thingKey, kind: input.kind, status: "open" },
                select: { id: true },
            });
            if (open) return tx.snapshotAnnotation.update({ where: { id: open.id }, data: { text, snapshotId } });
            return tx.snapshotAnnotation.create({ data: { locationId, snapshotId, kind: input.kind, thingKey, text } });
        });
    }

    static async updateAnnotation(annotationId: string, changes: SnapshotAnnotationUpdateInput): Promise<SnapshotAnnotation> {
        const annotation = await prisma.snapshotAnnotation.findUnique({
            where: { id: annotationId },
            select: { kind: true, location: { select: { projectId: true } } },
        });
        if (!annotation) throw new NotFoundError("Snapshot annotation not found");
        const kind = SnapshotAnnotationKindSchema.parse(annotation.kind);

        if (kind !== "note" && (changes.region !== undefined || changes.storyObjectId !== undefined)) {
            throw new UserFacingError("Only notes have a region or a linked story object");
        }
        let text: string | undefined;
        if (changes.text !== undefined) {
            const parsed = annotationTextSchema(kind).safeParse(changes.text);
            if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Invalid text");
            text = sanitizeInput(parsed.data);
        }
        if (changes.storyObjectId) await assertLinkable(changes.storyObjectId, annotation.location.projectId);

        return prisma.snapshotAnnotation.update({
            where: { id: annotationId },
            data: {
                ...(text !== undefined && { text }),
                ...(changes.status !== undefined && { status: changes.status }),
                ...(changes.region !== undefined && { region: changes.region }),
                ...(changes.storyObjectId !== undefined && { storyObjectId: changes.storyObjectId }),
            },
        });
    }

    static async deleteAnnotation(annotationId: string): Promise<{ deleted: true; id: string }> {
        const { count } = await prisma.snapshotAnnotation.deleteMany({ where: { id: annotationId } });
        if (count === 0) throw new NotFoundError("Snapshot annotation not found");
        return { deleted: true, id: annotationId };
    }
}
