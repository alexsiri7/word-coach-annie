import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { maskEmails, redact } from "./redact";

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

const SENSITIVE_HEADER = /^(authorization|cookie|x-user-email|x-user-id)$/i;

/**
 * The MCP SDK answers a client whose `Mcp-Protocol-Version` it doesn't support
 * with a 400 carrying this message. That is spec-defined version negotiation
 * (the client retries with a version from the supported list), not a server
 * fault, so it must not open Sentry issues.
 */
const MCP_PROTOCOL_VERSION_MISMATCH = "Bad Request: Unsupported protocol version:";

function isMcpProtocolVersionMismatch(event: ErrorEvent): boolean {
    const messages = [event.message, ...(event.exception?.values ?? []).map((v) => v.value)];
    return messages.some((m) => m?.startsWith(MCP_PROTOCOL_VERSION_MISMATCH));
}

export function beforeSend(event: ErrorEvent): ErrorEvent | null {
    if (isMcpProtocolVersionMismatch(event)) return null;
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
