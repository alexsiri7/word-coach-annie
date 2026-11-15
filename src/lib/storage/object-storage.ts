/**
 * Minimal client for the private bucket that holds location images and snapshots:
 * a Cloudflare R2 bucket reached through its S3 API, signed with SigV4 (aws4fetch).
 * The credentials are an R2 API token scoped to this bucket only, so they reach
 * nothing else. Browsers only ever get short-lived presigned URLs minted here.
 */
import { AwsClient } from "aws4fetch";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/controllers/errors";

export class StorageNotConfiguredError extends UserFacingError {
    constructor() {
        super("Image storage is not configured");
        this.name = "StorageNotConfiguredError";
    }
}

/** Presigned S3 URLs live at most a week. */
const MAX_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

export function isStorageConfigured(): boolean {
    return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

/** The origin presigned URLs point at, for the CSP's img-src; null when storage is not configured. */
export function storageOrigin(accountId: string | undefined = env.R2_ACCOUNT_ID): string | null {
    return accountId && /^[0-9a-f]{32}$/.test(accountId) ? `https://${accountId}.r2.cloudflarestorage.com` : null;
}

let cached: { key: string; client: AwsClient } | null = null;

function config() {
    const origin = storageOrigin();
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    if (!origin || !accessKeyId || !secretAccessKey) throw new StorageNotConfiguredError();
    const key = `${accessKeyId}:${secretAccessKey}`;
    if (cached?.key !== key) {
        cached = { key, client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }) };
    }
    return { client: cached.client, base: `${origin}/${env.R2_BUCKET || "annie-location-images"}` };
}

function encodePath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
}

async function request(client: AwsClient, url: string, init: RequestInit): Promise<Response> {
    const res = await client.fetch(url, init);
    if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`Object storage ${init.method} failed: ${res.status} ${body}`);
    }
    return res;
}

/** Objects are immutable once written (an existing path is refused), so they carry a one-year cache lifetime. */
export async function uploadObject(path: string, data: Buffer, contentType: string): Promise<void> {
    const { client, base } = config();
    await request(client, `${base}/${encodePath(path)}`, {
        method: "PUT",
        headers: { "content-type": contentType, "cache-control": "max-age=31536000", "if-none-match": "*" },
        body: new Uint8Array(data),
    });
}

/** Signing is local: no request reaches the bucket until the browser follows the URL. */
async function sign(client: AwsClient, base: string, path: string, expiresIn: number): Promise<string> {
    const url = new URL(`${base}/${encodePath(path)}`);
    url.searchParams.set("X-Amz-Expires", String(Math.max(1, Math.min(Math.floor(expiresIn), MAX_EXPIRES_SECONDS))));
    const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
    return signed.url;
}

export async function createSignedUrl(path: string, expiresIn: number): Promise<string> {
    const { client, base } = config();
    return sign(client, base, path, expiresIn);
}

/** Signs many paths; the result maps each path to its signed URL. */
export async function createSignedUrls(paths: string[], expiresIn: number): Promise<Map<string, string>> {
    const signed = new Map<string, string>();
    if (paths.length === 0) return signed;
    const { client, base } = config();
    for (const path of new Set(paths)) signed.set(path, await sign(client, base, path, expiresIn));
    return signed;
}

/** Deleting a path that does not exist succeeds, as S3 does. */
export async function removeObjects(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { client, base } = config();
    await Promise.all(paths.map((path) => request(client, `${base}/${encodePath(path)}`, { method: "DELETE" })));
}
