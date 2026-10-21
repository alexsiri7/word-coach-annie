/**
 * Client IP for per-IP rate limiting.
 *
 * Railway's edge sets (and overwrites) `X-Real-IP` with the client's remote IP,
 * including behind Cloudflare. `X-Forwarded-For` and `CF-Connecting-IP` are
 * deliberately not read: a client can supply them, and the origin is reachable
 * without Cloudflare (SEC-05). Without the header (local dev, tests) every
 * request shares the "anon" bucket.
 */
export function getClientIp(headers: Headers): string {
    const ip = headers.get("x-real-ip")?.trim();
    return ip ? ip : "anon";
}
