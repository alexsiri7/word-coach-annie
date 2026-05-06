/**
 * Sentry PII scrubber.
 *
 * Wired as the `beforeSend` hook in all three sentry.*.config.ts files.
 * Mutates the event in place to drop credentials and PII before the event
 * leaves the process. Returns the (mutated) event so Sentry sends it;
 * returning `null` instead would drop the event entirely.
 */
import type { ErrorEvent } from "@sentry/nextjs";

// Keys whose *values* are always replaced with [REDACTED] when seen in
// event.extra / event.contexts / event.user / event.breadcrumbs / headers.
// `email` is intentionally included: this app does not distinguish PII-subject
// email from operational email at this layer, so we err on the side of redaction.
const SENSITIVE_KEY = /token|secret|password|api[-_]?key|cookie|authorization|email/i;

/**
 * Walk an event subtree replacing sensitive values and truncating long strings.
 * `depth` is a recursion cap, not cycle detection — the WeakSet `seen` guards
 * cycles, the depth cap is a runtime ceiling. Strings >2000 chars are truncated
 * to keep events under Sentry's payload limits and to avoid leaking large blobs.
 *
 * Robust to throwing getters (DI containers / ORM proxies / custom toJSON):
 * a property whose access throws is replaced with "[unreadable]" rather than
 * propagating, so a buggy getter never costs the team a Sentry event.
 *
 * Preserves Error / Date / Map / Set / RegExp instances rather than walking
 * them with Object.entries (their useful properties are non-enumerable).
 */
function redact<T>(node: T, depth = 0, seen: WeakSet<object> = new WeakSet()): T {
    if (depth > 6 || node == null) return node;
    if (typeof node === "string") {
        return (node.length > 2000 ? node.slice(0, 2000) + "…[truncated]" : node) as unknown as T;
    }
    if (typeof node !== "object") return node;

    // Preserve types we shouldn't recurse into — Object.entries strips their useful props.
    if (node instanceof Error) return node;
    if (node instanceof Date) return node;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(node)) return "[Buffer]" as unknown as T;
    if (node instanceof Map || node instanceof Set || node instanceof RegExp) return node;

    if (seen.has(node as object)) return "[Circular]" as unknown as T;
    seen.add(node as object);

    if (Array.isArray(node)) {
        return node.map((n) => redact(n, depth + 1, seen)) as unknown as T;
    }

    const out: Record<string, unknown> = {};
    for (const k of Object.keys(node as Record<string, unknown>)) {
        try {
            const v = (node as Record<string, unknown>)[k];
            out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1, seen);
        } catch {
            out[k] = "[unreadable]";
        }
    }
    return out as T;
}

/** Sentry beforeSend hook — see file header. */
export function beforeSend(event: ErrorEvent): ErrorEvent {
    if (event.request?.cookies) {
        (event.request as Record<string, unknown>).cookies = "[REDACTED]";
    }
    if (event.request?.headers) {
        for (const k of Object.keys(event.request.headers)) {
            if (SENSITIVE_KEY.test(k)) {
                event.request.headers[k] = "[REDACTED]";
            }
        }
    }
    if (event.user) {
        // Preserve `id` for triage; redact every other field (email, ip_address, username).
        const { id, ...rest } = event.user;
        event.user = { ...(id !== undefined ? { id } : {}), ...redact(rest) };
    }
    if (event.extra) event.extra = redact(event.extra);
    if (event.contexts) event.contexts = redact(event.contexts) as ErrorEvent["contexts"];
    if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => redact(b)) as ErrorEvent["breadcrumbs"];
    }
    return event;
}
