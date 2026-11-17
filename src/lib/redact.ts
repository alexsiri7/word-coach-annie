// raw/body/content/message/text carry manuscript-derived text (AI responses,
// upstream API error bodies) that callers pass to `logger.error` as meta.
const SENSITIVE_KEY =
    /token|secret|password|api[-_]?key|cookie|authorization|email|raw|body|content|message|text/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function maskEmails(s: string): string {
    return s.replace(EMAIL, "[EMAIL]");
}

export function redact<T>(node: T, depth = 0): T {
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
