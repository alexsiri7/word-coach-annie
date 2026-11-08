/** Next stamps the CSP nonce on every script it emits; browsers hide the attribute but keep the property. */
export function getCspNonce(): string | undefined {
    if (typeof document === "undefined") return undefined;
    return document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce || undefined;
}
