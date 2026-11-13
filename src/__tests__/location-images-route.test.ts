import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const stored = new Map<string, Buffer>();
vi.mock("@/lib/storage/supabase-storage", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/storage/supabase-storage")>();
    return {
        ...actual,
        uploadObject: vi.fn(async (path: string, data: Buffer) => { stored.set(path, data); }),
        createSignedUrl: vi.fn(async (path: string) => `https://storage.test/signed/${path}?token=t`),
        createSignedUrls: vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://storage.test/signed/${p}?token=t`]))),
        removeObjects: vi.fn(async (paths: string[]) => { for (const p of paths) stored.delete(p); }),
    };
});

import { getCurrentUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { createSignedUrl, removeObjects, uploadObject } from "@/lib/storage/supabase-storage";
import { StoryObjectController } from "@/lib/controllers/story-objects";
import { UniversesController } from "@/lib/controllers/universes";
import { GET as listImages, POST as uploadImage } from "@/app/api/story-objects/[id]/images/route";
import { PATCH, DELETE } from "@/app/api/location-images/[id]/route";
import { GET as getFile } from "@/app/api/location-images/[id]/file/route";
import { DELETE as deleteStoryObject } from "@/app/api/story-objects/[id]/route";

const OWNER = "image-owner";
const STRANGER = "image-stranger";

let png: Buffer;

async function setup(type = "LOCATION") {
    const project = await prisma.project.create({ data: { title: "P", userId: OWNER } });
    const location = await prisma.storyObject.create({ data: { projectId: project.id, type, name: "Amber Palace" } });
    return { project, location };
}

function upload(storyObjectId: string, file: Blob | string, fields: Record<string, string> = {}, csrf = true) {
    const form = new FormData();
    form.set("file", file);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    const req = new NextRequest(`http://localhost/api/story-objects/${storyObjectId}/images`, {
        method: "POST",
        headers: csrf ? { "x-csrf-protection": "1" } : {},
        body: form,
    });
    return uploadImage(req, { params: Promise.resolve({ id: storyObjectId }) });
}

async function uploadOk(storyObjectId: string, fields: Record<string, string> = {}) {
    const res = await upload(storyObjectId, new Blob([new Uint8Array(png)], { type: "image/png" }), fields);
    expect(res.status).toBe(201);
    return res.json();
}

function jsonRequest(url: string, method: string, body?: unknown) {
    return new NextRequest(`http://localhost${url}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const list = (id: string) => listImages(jsonRequest(`/api/story-objects/${id}/images`, "GET"), params(id));
const patch = (id: string, body: unknown) => PATCH(jsonRequest(`/api/location-images/${id}`, "PATCH", body), params(id));
const remove = (id: string) => DELETE(jsonRequest(`/api/location-images/${id}`, "DELETE"), params(id));
const file = (id: string, variant = "thumb") =>
    getFile(jsonRequest(`/api/location-images/${id}/file?variant=${variant}`, "GET"), params(id));

async function orderedImages(storyObjectId: string) {
    return prisma.locationImage.findMany({ where: { storyObjectId }, orderBy: { orderIndex: "asc" } });
}

describe("location images", () => {
    beforeEach(async () => {
        stored.clear();
        png ??= await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c84" } }).png().toBuffer();
        await prisma.user.create({ data: { id: OWNER, email: "owner@test.com", googleId: "g-owner" } });
        await prisma.user.create({ data: { id: STRANGER, email: "stranger@test.com", googleId: "g-stranger" } });
        vi.mocked(getCurrentUserId).mockReturnValue(OWNER);
    });

    it("uploads a re-encoded image and its thumbnail, and makes the first one the cover", async () => {
        const { location } = await setup();
        const image = await uploadOk(location.id, { kind: "mood", caption: "Dusk <b>light</b>" });

        expect(image).toMatchObject({ kind: "mood", caption: "Dusk light", isCover: true, orderIndex: 0, width: 64, height: 48 });
        const row = await prisma.locationImage.findUniqueOrThrow({ where: { id: image.id } });
        expect(vi.mocked(uploadObject).mock.calls.map((c) => c[0])).toEqual([row.storagePath, row.thumbPath]);
        expect(row.storagePath).toMatch(new RegExp(`^${location.projectId}/${location.id}/[0-9a-f-]+/full\\.webp$`));
        expect((await sharp(stored.get(row.storagePath)!).metadata()).format).toBe("webp");

        const second = await uploadOk(location.id);
        expect(second).toMatchObject({ kind: "reference", isCover: false, orderIndex: 1 });
    });

    it("requires the CSRF header to upload", async () => {
        const { location } = await setup();
        const res = await upload(location.id, new Blob([new Uint8Array(png)]), {}, false);
        expect(res.status).toBe(403);
    });

    it("refuses a non-image and stores nothing", async () => {
        const { location } = await setup();
        const res = await upload(location.id, new Blob(["hello"], { type: "image/png" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Not a supported image");
        expect(uploadObject).not.toHaveBeenCalled();
        expect(await prisma.locationImage.count()).toBe(0);
    });

    it("refuses a missing file, a bad kind, and a non-location", async () => {
        const { location } = await setup();
        expect((await upload(location.id, "not a file")).status).toBe(400);
        expect((await upload(location.id, new Blob([new Uint8Array(png)]), { kind: "poster" })).status).toBe(400);

        const { location: character } = await setup("CHARACTER");
        const res = await upload(character.id, new Blob([new Uint8Array(png)]));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Images can only be attached to locations");
    });

    it("refuses a file over 20 MB with 413 before decoding it", async () => {
        const { location } = await setup();
        const res = await upload(location.id, new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]));
        expect(res.status).toBe(413);
    });

    it("lists images in order with Annie file URLs and no storage paths", async () => {
        const { location } = await setup();
        const a = await uploadOk(location.id);
        await uploadOk(location.id);
        const res = await list(location.id);
        expect(res.status).toBe(200);
        const text = await res.text();
        const { data } = JSON.parse(text);
        expect(data).toHaveLength(2);
        expect(data[0]).toMatchObject({ id: a.id, thumbUrl: `/api/location-images/${a.id}/file?variant=thumb` });
        const rows = await orderedImages(location.id);
        for (const row of rows) {
            expect(text).not.toContain(row.storagePath);
            expect(text).not.toContain(row.thumbPath);
        }
        expect(text).not.toContain("storagePath");
    });

    it("reorders by renumbering all siblings", async () => {
        const { location } = await setup();
        const [a, b, c] = [await uploadOk(location.id), await uploadOk(location.id), await uploadOk(location.id)];

        expect((await patch(c.id, { orderIndex: 0 })).status).toBe(200);
        expect((await orderedImages(location.id)).map((i) => [i.id, i.orderIndex])).toEqual([[c.id, 0], [a.id, 1], [b.id, 2]]);

        await patch(c.id, { orderIndex: 99 });
        expect((await orderedImages(location.id)).map((i) => i.id)).toEqual([a.id, b.id, c.id]);
    });

    it("keeps exactly one cover", async () => {
        const { location } = await setup();
        await uploadOk(location.id);
        const b = await uploadOk(location.id);
        const res = await patch(b.id, { isCover: true, caption: "Front gate" });
        expect(await res.json()).toMatchObject({ isCover: true, caption: "Front gate" });
        const covers = await prisma.locationImage.findMany({ where: { storyObjectId: location.id, isCover: true } });
        expect(covers.map((i) => i.id)).toEqual([b.id]);
    });

    it("refuses an empty or invalid update", async () => {
        const { location } = await setup();
        const a = await uploadOk(location.id);
        expect((await patch(a.id, {})).status).toBe(400);
        expect((await patch(a.id, { kind: "poster" })).status).toBe(400);
        expect((await patch("missing", { caption: "x" })).status).toBe(404);
    });

    it("deletes an image and its files, renumbers, and promotes a new cover", async () => {
        const { location } = await setup();
        const a = await uploadOk(location.id);
        const b = await uploadOk(location.id);
        const row = await prisma.locationImage.findUniqueOrThrow({ where: { id: a.id } });

        expect((await remove(a.id)).status).toBe(200);
        expect(removeObjects).toHaveBeenCalledWith([row.storagePath, row.thumbPath]);
        const remaining = await orderedImages(location.id);
        expect(remaining.map((i) => [i.id, i.orderIndex, i.isCover])).toEqual([[b.id, 0, true]]);
    });

    it("redirects the file URL to a signed URL with a private cache lifetime", async () => {
        const { location } = await setup();
        const a = await uploadOk(location.id);
        const row = await prisma.locationImage.findUniqueOrThrow({ where: { id: a.id } });

        const thumb = await file(a.id);
        expect(thumb.status).toBe(302);
        expect(thumb.headers.get("location")).toBe(`https://storage.test/signed/${row.thumbPath}?token=t`);
        expect(thumb.headers.get("cache-control")).toBe("private, max-age=3000");
        expect(createSignedUrl).toHaveBeenCalledWith(row.thumbPath, 3600);

        expect((await file(a.id, "full")).headers.get("location")).toContain(row.storagePath);
        expect((await file(a.id, "original")).status).toBe(400);
    });

    describe("another user", () => {
        it.each([
            ["with no share", null],
            ["holding a READER share", "READER"],
            ["holding an EDITOR share", "EDITOR"],
        ])("cannot read or change an image %s", async (_label, role) => {
            const { project, location } = await setup();
            const image = await uploadOk(location.id);
            if (role) await prisma.projectShare.create({ data: { projectId: project.id, email: "stranger@test.com", role } });
            vi.mocked(getCurrentUserId).mockReturnValue(STRANGER);
            vi.mocked(createSignedUrl).mockClear();

            expect((await list(location.id)).status).toBe(403);
            expect((await file(image.id)).status).toBe(403);
            expect((await file(image.id, "full")).status).toBe(403);
            expect((await patch(image.id, { caption: "mine" })).status).toBe(403);
            expect((await remove(image.id)).status).toBe(403);
            expect((await upload(location.id, new Blob([new Uint8Array(png)]))).status).toBe(403);

            expect(createSignedUrl).not.toHaveBeenCalled();
            expect(await prisma.locationImage.findUniqueOrThrow({ where: { id: image.id } })).toMatchObject({ caption: "" });
        });
    });

    describe("deleting the parent", () => {
        it("removes the files when the story object is deleted over REST", async () => {
            const { location } = await setup();
            await uploadOk(location.id);
            const paths = (await orderedImages(location.id)).flatMap((i) => [i.storagePath, i.thumbPath]);

            const res = await deleteStoryObject(jsonRequest(`/api/story-objects/${location.id}`, "DELETE"), params(location.id));
            expect(res.status).toBe(200);
            expect(removeObjects).toHaveBeenCalledWith(paths);
            expect(stored.size).toBe(0);
        });

        it("removes the files when the controller deletes the story object", async () => {
            const { location } = await setup();
            await uploadOk(location.id);
            await StoryObjectController.deleteStoryObject(location.id);
            expect(stored.size).toBe(0);
            expect(await prisma.locationImage.count()).toBe(0);
        });

        it("refuses to move a location with images to the universe", async () => {
            const { project, location } = await setup();
            const universe = await prisma.universe.create({ data: { title: "U", userId: OWNER } });
            await prisma.project.update({ where: { id: project.id }, data: { universeId: universe.id } });
            await uploadOk(location.id);

            await expect(UniversesController.transferStoryObjectToUniverse(location.id, universe.id))
                .rejects.toThrow("Remove this location's images before moving it to the universe");
            expect(await prisma.storyObject.count({ where: { id: location.id } })).toBe(1);
            expect(await prisma.worldObject.count()).toBe(0);
        });
    });

    it("lists the cover id with the project's story objects", async () => {
        const { project, location } = await setup();
        await uploadOk(location.id);
        const cover = await uploadOk(location.id);
        await patch(cover.id, { isCover: true });

        const { objects } = await StoryObjectController.listStoryObjects({ projectId: project.id });
        expect(objects.find((o) => o.id === location.id)?.coverImageId).toBe(cover.id);
    });
});
