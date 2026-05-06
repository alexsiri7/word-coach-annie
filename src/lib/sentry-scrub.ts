import type { Event } from "@sentry/nextjs";

const SENSITIVE_KEY = /token|secret|password|api[-_]?key|cookie|authorization|email/i;

function redact<T>(node: T, depth = 0): T {
    if (depth > 6 || node == null) return node;
    if (typeof node === "string") {
        return (node.length > 2000 ? node.slice(0, 2000) + "…[truncated]" : node) as unknown as T;
    }
    if (typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((n) => redact(n, depth + 1)) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out as T;
}

export function beforeSend(event: Event): Event {
    if (event.request?.cookies) {
        (event.request as Record<string, unknown>).cookies = "[REDACTED]";
    }
    if (event.request?.headers) {
        for (const k of Object.keys(event.request.headers)) {
            if (/^(authorization|cookie)$/i.test(k)) {
                event.request.headers[k] = "[REDACTED]";
            }
        }
    }
    if (event.extra) event.extra = redact(event.extra);
    if (event.contexts) event.contexts = redact(event.contexts) as Event["contexts"];
    return event;
}
