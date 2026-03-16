/**
 * Centralized environment configuration.
 *
 * All env vars are defined here with Zod validation. Import `env` from this
 * module instead of using `process.env` directly. This prevents typos,
 * provides type safety, and fails fast on missing required vars.
 *
 * Reads from `process.env` on each access so tests can still mutate
 * `process.env` and see changes reflected immediately.
 *
 * NOTE: `process.env.NODE_ENV` is NOT included here — Next.js handles it
 * specially and it's inlined by the bundler.
 */
import { z } from "zod";

const envSchema = z.object({
  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // AI Chat
  AI_API_KEY: z.string().optional(),
  AI_API_BASE_URL: z.string().optional(),
  AI_MODEL: z.string().optional(),
  // Legacy aliases
  REQUESTY_API_KEY: z.string().optional(),
  REQUESTY_MODEL: z.string().optional(),

  // Auth & Security
  API_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),

  // Access control — invite-only allowlist (comma-separated emails)
  ALLOWED_EMAILS: z.string().optional(),

  // Feedback (GitHub issue creation)
  GITHUB_FEEDBACK_TOKEN: z.string().optional(),
  GITHUB_FEEDBACK_REPO: z.string().optional(), // format: "owner/repo"

  // MCP
  MCP_ALLOW_DESTRUCTIVE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),

  // Sentry error monitoring
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

// Validate once at startup to fail fast on bad values.
envSchema.parse(process.env);

/**
 * Proxy that reads from `process.env` on every access so that test-time
 * mutations of `process.env` are reflected without module re-imports.
 * MCP_ALLOW_DESTRUCTIVE is handled specially (returns boolean).
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (prop === "MCP_ALLOW_DESTRUCTIVE") {
      return process.env.MCP_ALLOW_DESTRUCTIVE === "true";
    }
    return process.env[prop];
  },
});
