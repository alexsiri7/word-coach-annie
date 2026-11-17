import { z } from "zod";
import { LocationImageCaptionSchema, LocationImageKindSchema } from "@/schemas/location-images";
import { defineTool } from "./types";

export const listLocationImagesSpec = defineTool({
    name: "list_location_images",
    description: "List the images attached to a LOCATION story object, in display order. Each has id, kind (reference | mood | sketch), caption, isCover, width, height, bytes, sha256 (changes only when the file does) and signed url / thumbUrl that expire after an hour.",
    destructive: false,
    parameters: z.object({
        storyObjectId: z.string().describe("The LOCATION story object ID"),
    }),
});

export const addLocationImageSpec = defineTool({
    name: "add_location_image",
    description: "Attach an image to a LOCATION story object, from an https url or base64 data (exactly one). JPEG, PNG, WebP or GIF, at most 20 MB and 25 megapixels; it is re-encoded to WebP (longest side 2048 px) with metadata stripped. The first image becomes the cover.",
    destructive: false,
    parameters: z.object({
        storyObjectId: z.string().describe("The LOCATION story object ID"),
        url: z.string().optional().describe("Public https URL of the image"),
        base64: z.string().optional().describe("Image bytes as base64 (a data:image/...;base64, prefix is allowed)"),
        kind: LocationImageKindSchema.optional().describe("reference (default), mood or sketch"),
        caption: LocationImageCaptionSchema.optional().describe("Caption"),
    }),
});

export const updateLocationImageSpec = defineTool({
    name: "update_location_image",
    description: "Change a location image's caption or kind, move it to a position (orderIndex, 0 = first), or make it the location's cover (isCover: true replaces the previous cover).",
    destructive: false,
    parameters: z.object({
        imageId: z.string().describe("The location image ID"),
        caption: LocationImageCaptionSchema.optional().describe("New caption"),
        kind: LocationImageKindSchema.optional().describe("reference, mood or sketch"),
        orderIndex: z.number().int().min(0).optional().describe("New position, 0-based"),
        isCover: z.boolean().optional().describe("true to make this the cover, false to clear it"),
    }),
});

export const deleteLocationImageSpec = defineTool({
    name: "delete_location_image",
    description: "Delete a location image and its stored files. Cannot be undone.",
    destructive: true,
    parameters: z.object({
        imageId: z.string().describe("The location image ID to delete"),
    }),
});
