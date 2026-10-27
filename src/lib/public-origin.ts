import { env } from "@/lib/env";

/**
 * The origin the app is publicly served from, for building absolute URLs.
 *
 * Never derive this from `Host` / `X-Forwarded-Host`: those are client-controlled,
 * and a forged value would be reflected into the URLs we hand out.
 */
export function publicOrigin(): string {
    const base = env.APP_BASE_URL || env.GOOGLE_REDIRECT_URI;
    if (!base) {
        throw new Error("APP_BASE_URL (or GOOGLE_REDIRECT_URI) must be set to build absolute URLs");
    }
    return new URL(base).origin;
}
