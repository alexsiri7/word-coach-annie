/**
 * Rate limit configs, kept free of imports so client code can share a window
 * with the server limiter without bundling env, logger or Redis.
 */
export interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    limit: number;
    /** Window size in milliseconds */
    windowMs: number;
    /**
     * When Redis errors, enforce the limit with this process's in-memory store
     * instead of allowing the request.
     */
    failOverToMemory?: boolean;
}

export const RATE_LIMITS = {
    /** AI chat endpoint: 30 requests per minute per user */
    chat: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Read operations (GET): 120 requests per minute per user */
    read: { limit: 120, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Write operations (POST/PATCH/DELETE): 60 requests per minute per user */
    write: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Project creation (POST /api/projects): 100 per hour per user */
    projectCreate: { limit: 100, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Project import (POST /api/projects/import): 20 per hour per user */
    projectImport: { limit: 20, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Feedback submission (POST /api/feedback): 5 per hour per user */
    feedback: { limit: 5, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Content report (POST /api/projects/[id]/report): 10 per hour per IP */
    report: { limit: 10, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Auth endpoints (login, refresh, me): 5 attempts per minute per IP — brute-force protection */
    auth: { limit: 5, windowMs: 60_000, failOverToMemory: true } satisfies RateLimitConfig,
    /** OAuth token endpoint (code exchange, refresh rotation): 10 per minute per IP */
    oauthToken: { limit: 10, windowMs: 60_000 } satisfies RateLimitConfig,
    /** OAuth client registration (POST /oauth/register): 5 per hour per IP */
    oauthRegister: { limit: 5, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Any other public (unauthenticated) path: 60 requests per minute per IP */
    public: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
};
