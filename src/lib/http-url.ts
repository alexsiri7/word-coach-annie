const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

/** True only for an absolute URL whose scheme is http or https. */
export function isHttpUrl(value: string): boolean {
    try {
        return HTTP_PROTOCOLS.has(new URL(value).protocol);
    } catch {
        return false;
    }
}

/**
 * Returns the value for use as an `href` only when it is an absolute http(s) URL,
 * so a stored `javascript:` or `data:` value never becomes a live link.
 */
export function safeHref(value: string | null | undefined): string | undefined {
    return value && isHttpUrl(value) ? value : undefined;
}
