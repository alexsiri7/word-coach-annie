import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
    ImageRejectedError,
    MAX_IMAGE_BYTES,
    processLocationImage,
} from "@/lib/location-images/process";

function solid(width: number, height: number) {
    return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } } });
}

describe("processLocationImage", () => {
    it("re-encodes a large JPEG to WebP within 2048 px with a 400 px thumbnail and no metadata", async () => {
        const jpeg = await solid(3000, 2000)
            .withExif({ IFD0: { Artist: "secret" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } })
            .jpeg()
            .toBuffer();
        expect((await sharp(jpeg).metadata()).exif).toBeDefined();

        const result = await processLocationImage(jpeg);

        const full = await sharp(result.full).metadata();
        expect(full).toMatchObject({ format: "webp", width: 2048, height: 1365 });
        expect(full.exif).toBeUndefined();
        expect(full.icc).toBeUndefined();
        expect(full.xmp).toBeUndefined();
        expect(result).toMatchObject({ width: 2048, height: 1365, bytes: result.full.length });
        expect(result.sha256).toBe(createHash("sha256").update(result.full).digest("hex"));

        const thumb = await sharp(result.thumb).metadata();
        expect(thumb).toMatchObject({ format: "webp", width: 400, height: 267 });
    });

    it("applies EXIF orientation before stripping it", async () => {
        const rotated = await solid(300, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer();
        expect(await processLocationImage(rotated)).toMatchObject({ width: 100, height: 300 });
    });

    it("does not enlarge a small image", async () => {
        const png = await solid(120, 80).png().toBuffer();
        const result = await processLocationImage(png);
        expect(result).toMatchObject({ width: 120, height: 80 });
        expect((await sharp(result.thumb).metadata()).width).toBe(120);
    });

    it.each([
        ["plain text", Buffer.from("this is not an image")],
        ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')],
    ])("refuses %s", async (_label, input) => {
        await expect(processLocationImage(input)).rejects.toBeInstanceOf(ImageRejectedError);
    });

    it("refuses a truncated JPEG", async () => {
        const jpeg = await solid(400, 300).jpeg().toBuffer();
        await expect(processLocationImage(jpeg.subarray(0, jpeg.length / 2))).rejects.toBeInstanceOf(ImageRejectedError);
    });

    it("refuses files over 20 MB before decoding them", async () => {
        await expect(processLocationImage(Buffer.alloc(MAX_IMAGE_BYTES + 1))).rejects.toThrow("Image is larger than 20 MB");
    });

    it("refuses images over 25 megapixels", async () => {
        const huge = await solid(6000, 4200).png().toBuffer();
        await expect(processLocationImage(huge)).rejects.toThrow("over 25 megapixels");
    });
});
