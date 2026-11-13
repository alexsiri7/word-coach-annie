/**
 * Minimal client for the Supabase Storage REST API (the four endpoints location
 * images need), authenticated with the service role key. The bucket is private:
 * browsers only ever get short-lived signed URLs minted here.
 */
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/controllers/errors";

export class StorageNotConfiguredError extends UserFacingError {
    constructor() {
        super("Image storage is not configured");
        this.name = "StorageNotConfiguredError";
    }
}

export function isStorageConfigured(): boolean {
    return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function config() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new StorageNotConfiguredError();
    return {
        base: `${url.replace(/\/+$/, "")}/storage/v1`,
        bucket: env.SUPABASE_STORAGE_BUCKET || "location-images",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
    };
}

function encodePath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
}

async function request(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<Response> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`Supabase Storage ${init.method} failed: ${res.status} ${body}`);
    }
    return res;
}

/** Objects are immutable once written, so they carry a one-year cache lifetime. */
export async function uploadObject(path: string, data: Buffer, contentType: string): Promise<void> {
    const { base, bucket, headers } = config();
    await request(`${base}/object/${bucket}/${encodePath(path)}`, {
        method: "POST",
        headers: { ...headers, "content-type": contentType, "cache-control": "max-age=31536000", "x-upsert": "false" },
        body: new Uint8Array(data),
    });
}

export async function createSignedUrl(path: string, expiresIn: number): Promise<string> {
    const { base, bucket, headers } = config();
    const res = await request(`${base}/object/sign/${bucket}/${encodePath(path)}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ expiresIn }),
    });
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${base}${signedURL}`;
}

/** Signs many paths in one call; the result maps each path to its signed URL. */
export async function createSignedUrls(paths: string[], expiresIn: number): Promise<Map<string, string>> {
    const signed = new Map<string, string>();
    if (paths.length === 0) return signed;
    const { base, bucket, headers } = config();
    const res = await request(`${base}/object/sign/${bucket}`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ expiresIn, paths }),
    });
    const rows = (await res.json()) as Array<{ path: string | null; signedURL: string | null; error: string | null }>;
    for (const row of rows) {
        if (row.path && row.signedURL) signed.set(row.path, `${base}${row.signedURL}`);
    }
    return signed;
}

export async function removeObjects(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { base, bucket, headers } = config();
    await request(`${base}/object/${bucket}`, {
        method: "DELETE",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
    });
}
