import { mcpRun } from "@/mcp/tool-errors";
import { UserFacingError } from "@/lib/controllers/errors";
import { LocationImageUpdateSchema } from "@/schemas/location-images";
import {
    listLocationImages,
    addLocationImage,
    updateLocationImage,
    deleteLocationImage,
} from "@/mcp/tools/location-images";
import { LocationSnapshotController } from "@/lib/controllers/location-snapshots";
import {
    listLocationSnapshots,
    getLocationSnapshot,
    addSnapshotAnnotation,
    updateSnapshotAnnotation,
} from "@/mcp/tools/location-snapshots";
import {
    getLocationMap,
    setLocationMap,
    upsertLocationMapItem,
    deleteLocationMapItem,
} from "@/mcp/tools/location-maps";
import {
    assertProjectOwner as verifyProjectOwnership,
    projectIdForLocationImage,
    projectIdForLocationSnapshot,
    projectIdForSnapshotAnnotation,
    projectIdForStoryObject,
} from "@/lib/ownership";
import {
    listLocationImagesSpec,
    addLocationImageSpec,
    updateLocationImageSpec,
    deleteLocationImageSpec,
} from "@/lib/ai/tool-catalog/location-images";
import {
    getLocationMapSpec,
    setLocationMapSpec,
    upsertLocationMapItemSpec,
    deleteLocationMapItemSpec,
} from "@/lib/ai/tool-catalog/location-maps";
import {
    listLocationSnapshotsSpec,
    getLocationSnapshotSpec,
    addSnapshotAnnotationSpec,
    updateSnapshotAnnotationSpec,
} from "@/lib/ai/tool-catalog/location-snapshots";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerLocationTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listLocationImagesSpec, async ({ storyObjectId }) =>
        mcpRun("list_location_images", "Error listing location images", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId), userId);
            return listLocationImages(storyObjectId);
        }));

    registerTool(ctx, addLocationImageSpec, async (params) =>
        mcpRun("add_location_image", "Error adding location image", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(params.storyObjectId), userId);
            return addLocationImage(params);
        }));

    registerTool(ctx, updateLocationImageSpec, async ({ imageId, ...changes }) =>
        mcpRun("update_location_image", "Error updating location image", async () => {
            await verifyProjectOwnership(await projectIdForLocationImage(imageId), userId);
            const parsed = LocationImageUpdateSchema.safeParse(changes);
            if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Invalid input");
            return updateLocationImage(imageId, parsed.data);
        }));

    registerTool(ctx, deleteLocationImageSpec, async ({ imageId }) => {
        return mcpRun("delete_location_image", "Error deleting location image", async () => {
            await verifyProjectOwnership(await projectIdForLocationImage(imageId), userId);
            return deleteLocationImage(imageId);
        });
    });

    registerTool(ctx, getLocationMapSpec, async ({ storyObjectId }) =>
        mcpRun("get_location_map", "Error reading location map", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId), userId);
            return getLocationMap(storyObjectId);
        }));

    registerTool(ctx, setLocationMapSpec, async ({ storyObjectId, map, contentHash }) =>
        mcpRun("set_location_map", "Error saving location map", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId), userId);
            return setLocationMap(storyObjectId, map, contentHash);
        }));

    registerTool(ctx, upsertLocationMapItemSpec, async ({ storyObjectId, item }) =>
        mcpRun("upsert_location_map_item", "Error saving location map item", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId), userId);
            return upsertLocationMapItem(storyObjectId, item);
        }));

    registerTool(ctx, deleteLocationMapItemSpec, async ({ storyObjectId, itemId }) => {
        return mcpRun("delete_location_map_item", "Error deleting location map item", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId), userId);
            return deleteLocationMapItem(storyObjectId, itemId);
        });
    });

    registerTool(ctx, listLocationSnapshotsSpec, async ({ storyObjectId }) =>
        mcpRun("list_location_snapshots", "Error listing location snapshots", async () => {
            await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId), userId);
            return listLocationSnapshots(storyObjectId);
        }));

    registerTool(ctx, getLocationSnapshotSpec, async ({ snapshotId, storyObjectId }) =>
        mcpRun("get_location_snapshot", "Error getting location snapshot", async () => {
            if ((snapshotId === undefined) === (storyObjectId === undefined)) {
                throw new UserFacingError("Provide exactly one of snapshotId or storyObjectId");
            }
            if (snapshotId !== undefined) {
                await verifyProjectOwnership(await projectIdForLocationSnapshot(snapshotId), userId);
                return getLocationSnapshot(snapshotId);
            }
            await verifyProjectOwnership(await projectIdForStoryObject(storyObjectId!), userId);
            return getLocationSnapshot(await LocationSnapshotController.latestId(storyObjectId!));
        }));

    registerTool(ctx, addSnapshotAnnotationSpec, async ({ snapshotId, ...input }) =>
        mcpRun("add_snapshot_annotation", "Error adding snapshot annotation", async () => {
            await verifyProjectOwnership(await projectIdForLocationSnapshot(snapshotId), userId);
            return addSnapshotAnnotation(snapshotId, input);
        }));

    registerTool(ctx, updateSnapshotAnnotationSpec, async ({ annotationId, ...changes }) =>
        mcpRun("update_snapshot_annotation", "Error updating snapshot annotation", async () => {
            await verifyProjectOwnership(await projectIdForSnapshotAnnotation(annotationId), userId);
            return updateSnapshotAnnotation(annotationId, changes);
        }));
}
