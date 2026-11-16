import { z } from "zod";
import {
    SnapshotAnnotationKindSchema,
    SnapshotAnnotationStatusSchema,
    SnapshotRegionSchema,
} from "@/schemas/location-snapshots";
import { defineTool } from "./types";

export const listLocationSnapshotsSpec = defineTool({
    name: "list_location_snapshots",
    description: "List a LOCATION's game snapshots, newest first (at most 10 are kept): id, build, takenAt, width, height and thingCount. Also returns notes whose snapshot has since been deleted, as text.",
    destructive: false,
    parameters: z.object({
        storyObjectId: z.string().describe("The LOCATION story object ID"),
    }),
});

export const getLocationSnapshotSpec = defineTool({
    name: "get_location_snapshot",
    description: "Get a game snapshot of a location: its things ({ key, name, description, kind, box }, box in screenshot pixels of width × height), a signed imageUrl that expires after an hour, and annotations: notes on this snapshot plus every name/description change requested for the location. Pass snapshotId, or storyObjectId for the latest snapshot.",
    destructive: false,
    parameters: z.object({
        snapshotId: z.string().optional().describe("The snapshot ID"),
        storyObjectId: z.string().optional().describe("A LOCATION story object ID, for its latest snapshot"),
    }),
});

export const addSnapshotAnnotationSpec = defineTool({
    name: "add_snapshot_annotation",
    description: "Annotate a game snapshot. kind note: a note (text) on an optional region (point, rect or path in screenshot pixels), optionally about a thing (thingKey) and linked to a story object of the same project. kind description or name: request that a thing's (thingKey) description or name change to text; it stays open until a later snapshot carries that text, and replaces the thing's earlier open request.",
    destructive: false,
    parameters: z.object({
        snapshotId: z.string().describe("The snapshot ID"),
        kind: SnapshotAnnotationKindSchema.describe("note, description or name"),
        text: z.string().describe("The note, or the requested description or name"),
        thingKey: z.string().optional().describe("The thing's key; required for description and name"),
        region: SnapshotRegionSchema.optional().describe("Notes only: { type: point, x, y } | { type: rect, x, y, w, h } | { type: path, points: [[x, y], ...] }"),
        storyObjectId: z.string().optional().describe("Notes only: a story object of the same project the note is about"),
    }),
});

export const updateSnapshotAnnotationSpec = defineTool({
    name: "update_snapshot_annotation",
    description: "Change a snapshot annotation's text or status (open, sent = exported by the story sync, done = resolved), or a note's region or linked story object (null unlinks).",
    destructive: false,
    parameters: z.object({
        annotationId: z.string().describe("The annotation ID"),
        text: z.string().optional().describe("New text"),
        status: SnapshotAnnotationStatusSchema.optional().describe("open, sent or done"),
        region: SnapshotRegionSchema.optional().describe("Notes only: new region"),
        storyObjectId: z.string().nullable().optional().describe("Notes only: story object to link, or null to unlink"),
    }),
});
