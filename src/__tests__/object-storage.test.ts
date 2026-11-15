import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock("@/lib/env", () => ({ env }));

import {
    StorageNotConfiguredError,
    createSignedUrl,
    createSignedUrls,
    isStorageConfigured,
    removeObjects,
    storageOrigin,
    uploadObject,
} from "@/lib/storage/object-storage";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    Object.assign(env, {
        R2_ACCOUNT_ID: ACCOUNT,
        R2_ACCESS_KEY_ID: "test-access-key",
        R2_SECRET_ACCESS_KEY: "test-secret-key",
        R2_BUCKET: undefined,
    });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function sent(i = 0): Request {
    const [input, init] = fetchMock.mock.calls[i];
    return input instanceof Request ? input : new Request(input, init);
}

describe("object storage (R2)", () => {
    it("is not configured without all three credentials", async () => {
        env.R2_SECRET_ACCESS_KEY = undefined;
        expect(isStorageConfigured()).toBe(false);
        await expect(createSignedUrl("a.webp", 60)).rejects.toBeInstanceOf(StorageNotConfiguredError);
        await expect(uploadObject("a.webp", Buffer.from("x"), "image/webp")).rejects.toBeInstanceOf(StorageNotConfiguredError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("derives the bucket origin only from a real account id", () => {
        expect(storageOrigin()).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
        expect(storageOrigin("not-an-account")).toBeNull();
    });

    it("uploads with a signed PUT that refuses to overwrite", async () => {
        await uploadObject("loc/1/a b.webp", Buffer.from("img"), "image/webp");
        const req = sent();
        expect(req.method).toBe("PUT");
        expect(req.url).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/annie-location-images/loc/1/a%20b.webp`);
        expect(req.headers.get("if-none-match")).toBe("*");
        expect(req.headers.get("content-type")).toBe("image/webp");
        expect(req.headers.get("cache-control")).toBe("max-age=31536000");
        expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/auto\/s3\/aws4_request/);
    });

    it("reports a failed request with its status", async () => {
        fetchMock.mockResolvedValue(new Response("<Error>PreconditionFailed</Error>", { status: 412 }));
        await expect(uploadObject("a.webp", Buffer.from("x"), "image/webp")).rejects.toThrow(/PUT failed: 412/);
    });

    it("presigns GET URLs locally, in the configured bucket, with the expiry capped at a week", async () => {
        env.R2_BUCKET = "other-bucket";
        const url = new URL(await createSignedUrl("loc/1/a.webp", 3600));
        expect(url.origin + url.pathname).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/other-bucket/loc/1/a.webp`);
        expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
        expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);

        const long = new URL(await createSignedUrl("a.webp", 30 * 24 * 3600));
        expect(long.searchParams.get("X-Amz-Expires")).toBe(String(7 * 24 * 3600));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("signs many paths at once, one entry per distinct path", async () => {
        const signed = await createSignedUrls(["a.webp", "b.webp", "a.webp"], 60);
        expect([...signed.keys()]).toEqual(["a.webp", "b.webp"]);
        expect(await createSignedUrls([], 60)).toEqual(new Map());
    });

    it("deletes each path", async () => {
        await removeObjects(["a.webp", "b.webp"]);
        expect(fetchMock.mock.calls.map((_, i) => `${sent(i).method} ${new URL(sent(i).url).pathname}`).sort()).toEqual([
            "DELETE /annie-location-images/a.webp",
            "DELETE /annie-location-images/b.webp",
        ]);
        fetchMock.mockClear();
        await removeObjects([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
