import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

const PII_HEADER_DENY = ["forwarded", "-ip", "remote-", "via", "-user"];

/**
 * Sentry v11 replaced `sendDefaultPii` with `dataCollection`, and leaving it
 * unset now collects cookies, full request/response bodies, user info, DB
 * query data and GenAI inputs/outputs by default. Request bodies here carry
 * manuscript text (user PII), and `beforeSend` does not scrub `request.data`,
 * so pin the v10 `sendDefaultPii: false` baseline explicitly (values taken
 * from the v10 -> v11 migration guide).
 */
export const dataCollection = {
    userInfo: false,
    cookies: false,
    httpHeaders: {
        request: { deny: PII_HEADER_DENY },
        response: { deny: PII_HEADER_DENY },
    },
    httpBodies: [],
    urlQueryParams: { deny: PII_HEADER_DENY },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
} satisfies NonNullable<Parameters<typeof import("@sentry/nextjs").init>[0]>["dataCollection"];

// raw/body/content/message/text carry manuscript-derived text (AI responses,
// upstream API error bodies) that callers pass to `logger.error` as meta.
const SENSITIVE_KEY =
    /token|secret|password|api[-_]?key|cookie|authorization|email|raw|body|content|message|text/i;
const SENSITIVE_HEADER = /^(authorization|cookie|x-user-email|x-user-id)$/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function maskEmails(s: string): string {
    return s.replace(EMAIL, "[EMAIL]");
}

function redact<T>(node: T, depth = 0): T {
    if (depth > 6 || node == null) return node;
    if (typeof node === "string") {
        const truncated = node.length > 2000 ? node.slice(0, 2000) + "…[truncated]" : node;
        return truncated as unknown as T;
    }
    if (typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map((n) => redact(n, depth + 1)) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out as T;
}

export function beforeSend(event: ErrorEvent): ErrorEvent {
    if (event.request?.cookies) {
        (event.request as Record<string, unknown>).cookies = "[REDACTED]";
    }
    if (event.request?.headers) {
        for (const k of Object.keys(event.request.headers)) {
            if (SENSITIVE_HEADER.test(k)) {
                event.request.headers[k] = "[REDACTED]";
            }
        }
    }
    if (event.message) event.message = maskEmails(event.message);
    for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = maskEmails(ex.value);
    }
    if (event.extra) event.extra = redact(event.extra);
    if (event.contexts) event.contexts = redact(event.contexts) as ErrorEvent["contexts"];
    return event;
}

// Console breadcrumbs replay whatever was logged, including response bodies.
export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
    return breadcrumb.category === "console" ? null : breadcrumb;
}
