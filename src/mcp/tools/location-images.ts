import { LocationImageController } from "@/lib/controllers/location-images";
import { fetchRemoteImage } from "@/lib/location-images/fetch-remote";
import { UserFacingError } from "@/lib/controllers/errors";
import { mcpCache } from "@/lib/cache";
import type { LocationImageKind, LocationImageUpdateInput } from "@/schemas/location-images";

/** list_story_objects results carry each location's coverImageId. */
function invalidateStoryObjectLists() {
    mcpCache.invalidatePrefix("storyObjects:");
}

export async function listLocationImages(storyObjectId: string) {
    return LocationImageController.listWithSignedUrls(storyObjectId);
}

export async function addLocationImage(params: {
    storyObjectId: string;
    url?: string;
    base64?: string;
    kind?: LocationImageKind;
    caption?: string;
}) {
    if ((params.url === undefined) === (params.base64 === undefined)) {
        throw new UserFacingError("Provide exactly one of url or base64");
    }
    const input = params.url !== undefined
        ? await fetchRemoteImage(params.url)
        : Buffer.from(params.base64!.replace(/^data:[^,]*;base64,/, ""), "base64");
    const result = await LocationImageController.add(params.storyObjectId, input, {
        kind: params.kind,
        caption: params.caption,
    });
    invalidateStoryObjectLists();
    return result;
}

export async function updateLocationImage(imageId: string, changes: LocationImageUpdateInput) {
    const result = await LocationImageController.update(imageId, changes);
    invalidateStoryObjectLists();
    return result;
}

export async function deleteLocationImage(imageId: string) {
    const result = await LocationImageController.delete(imageId);
    invalidateStoryObjectLists();
    return result;
}
