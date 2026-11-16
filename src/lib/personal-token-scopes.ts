/**
 * The personal API token scope vocabulary, split out from @/lib/personal-tokens so it can be
 * imported by client components without pulling in that module's server-only dependencies
 * (prisma, crypto, logger).
 */
export const PERSONAL_TOKEN_SCOPES = ["read", "write", "snapshots", "mark-sent"] as const;
export type PersonalTokenScope = (typeof PERSONAL_TOKEN_SCOPES)[number];

export function isPersonalTokenScope(value: unknown): value is PersonalTokenScope {
    return PERSONAL_TOKEN_SCOPES.includes(value as PersonalTokenScope);
}
