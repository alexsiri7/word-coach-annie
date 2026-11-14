import { createHash } from "node:crypto";
import sharp from "sharp";
import { UserFacingError } from "@/lib/controllers/errors";
import { logger } from "@/lib/logger";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/**
 * The production container has ~120 MB of headroom; a single decode of a 25 MP
 * image peaks around 65 MB, while 40 MP measured up to 260 MB. 25 MP still
 * accepts a 6000×4000 photo.
 */
export const MAX_IMAGE_PIXELS = 25_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

export class ImageRejectedError extends UserFacingError {
    constructor(message: string) {
        super(message);
        this.name = "ImageRejectedError";
    }
}

export interface ProcessedImage {
    full: Buffer;
    thumb: Buffer;
    width: number;
    height: number;
    /** The upload's upright size, before any downscale. */
    sourceWidth: number;
    sourceHeight: number;
    bytes: number;
    sha256: string;
}

sharp.cache(false);
sharp.concurrency(1);

/** sharp's errors on untrusted input become a rejection the uploader can read. */
async function decodeStep<T>(step: () => Promise<T>): Promise<T> {
    try {
        return await step();
    } catch (e) {
        logger.warn("Location image could not be decoded", { error: String(e) });
        if (e instanceof Error && /pixel limit/i.test(e.message)) {
            throw new ImageRejectedError("Image is too large (over 25 megapixels)");
        }
        throw new ImageRejectedError("Not a supported image");
    }
}

/**
 * Re-encodes an upload to WebP (longest side ≤ 2048 px) plus a 400 px thumbnail.
 * sharp writes no EXIF/ICC/XMP unless asked, so GPS and camera metadata are
 * dropped; EXIF orientation is applied first so the picture stays upright.
 */
export async function processLocationImage(input: Buffer): Promise<ProcessedImage> {
    if (input.length > MAX_IMAGE_BYTES) throw new ImageRejectedError("Image is larger than 20 MB");

    const options = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" as const };
    const metadata = await decodeStep(() => sharp(input, options).metadata());
    const { format } = metadata;
    if (!format || !ACCEPTED_FORMATS.has(format)) {
        throw new ImageRejectedError("Not a supported image (use JPEG, PNG, WebP or GIF)");
    }

    const full = await decodeStep(() =>
        sharp(input, options)
            .rotate()
            .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer({ resolveWithObject: true })
    );

    const thumb = await sharp(full.data)
        .resize(400, 400, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();

    const quarterTurned = (metadata.orientation ?? 1) >= 5;
    return {
        full: full.data,
        thumb,
        width: full.info.width,
        height: full.info.height,
        sourceWidth: quarterTurned ? metadata.height : metadata.width,
        sourceHeight: quarterTurned ? metadata.width : metadata.height,
        bytes: full.data.length,
        sha256: createHash("sha256").update(full.data).digest("hex"),
    };
}
