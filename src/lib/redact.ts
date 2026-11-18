// raw/body/content/message/text carry manuscript-derived text (AI responses,
// upstream API error bodies) that callers pass to `logger.error` as meta.
const SENSITIVE_KEY =
    /token|secret|password|api[-_]?key|cookie|authorization|email|raw|body|content|message|text/i;
// Callers log `{ error: String(e) }`, whose text can quote upstream bodies.
const STRINGIFIED_ERROR_KEY = /^err(or)?$/i;
// Identifiers such as `tokenId`/`tokenClientId` reference a secret without carrying it.
const IDENTIFIER_KEY = /(?:I[dD]s?|[_-]ids?)$/;
// Bounded local part and lookbehind keep matching linear on long runs of local-part characters.
const EMAIL = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function maskEmails(s: string): string {
    return s.replace(EMAIL, "[EMAIL]");
}

function isSensitiveKey(key: string): boolean {
    return (SENSITIVE_KEY.test(key) && !IDENTIFIER_KEY.test(key)) || STRINGIFIED_ERROR_KEY.test(key);
}

// Counts and flags under a sensitive-looking key (`revokedTokens`, `messageCount`) stay readable.
function carriesText(value: unknown): boolean {
    return typeof value === "string" || (typeof value === "object" && value !== null && !(value instanceof Error));
}

// An Error's message can embed AI output or an upstream response body (e.g. a
// JSON parse error quoting the text it failed on), so only its type, code and
// stack frames are kept.
function summarizeError(err: Error): Record<string, unknown> {
    const code = (err as { code?: unknown }).code;
    return {
        name: err.name,
        ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
        message: "[REDACTED]",
        stack: err.stack
            ?.split("\n")
            .filter((line) => /^\s+at /.test(line))
            .join("\n"),
    };
}

export function redact<T>(node: T, depth = 0): T {
    if (depth > 6 || node == null) return node;
    if (typeof node === "string") {
        const truncated = node.length > 2000 ? node.slice(0, 2000) + "…[truncated]" : node;
        return truncated as unknown as T;
    }
    if (typeof node !== "object") return node;
    if (node instanceof Error) return summarizeError(node) as T;
    if (Array.isArray(node)) return node.map((n) => redact(n, depth + 1)) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = carriesText(v) && isSensitiveKey(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out as T;
}
