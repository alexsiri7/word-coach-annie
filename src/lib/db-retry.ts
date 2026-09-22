import { logger } from "@/lib/logger";

/**
 * Retry policy for database connection faults (#1143).
 *
 * Only failures that prove the statement never reached Postgres are retryable:
 * if the connection was never established, no write can have committed, so
 * retrying is safe even for mutations. Failures that drop an in-flight
 * connection ("ConnectionClosed", "SocketTimeout") are ambiguous — the
 * statement may already have run — and retrying them would duplicate writes.
 * Do not widen this predicate without that guarantee.
 *
 * Detection is by error shape rather than `instanceof`: the adapter errors are
 * raised by `@prisma/driver-adapter-utils`, a transitive dependency, and Prisma
 * re-wraps most of them into a `PrismaClientKnownRequestError` that keeps the
 * original under `meta.driverAdapterError`.
 */

/**
 * Supavisor — the Supabase pooler in front of this database — reports an
 * upstream connect failure as a Postgres FATAL carrying this phrase. Its other
 * FATALs ("Max client connections reached", "Tenant or user not found") must
 * not match: the first would amplify saturation, the second is a config error
 * that fails identically on every retry.
 */
const CONNECT_FAILURE = /failed to connect to database/i;

/** Adapter error kinds raised before any statement is sent. */
const RETRYABLE_ADAPTER_KINDS = new Set(["DatabaseNotReachable", "TlsConnectionError"]);

/** Delay before each retry; total attempts = length + 1. */
export const RETRY_DELAYS_MS: readonly number[] = [150, 600];

/**
 * How many links of an error chain to inspect. Prisma surfaces an adapter
 * failure either as the `DriverAdapterError` itself or as its own error class
 * carrying the adapter error under `meta.driverAdapterError`.
 */
const MAX_LINKS = 5;

function isRetryableLink(link: object): boolean {
  const { name, message, cause } = link as {
    name?: unknown;
    message?: unknown;
    cause?: unknown;
  };

  if (typeof message === "string" && CONNECT_FAILURE.test(message)) return true;
  if (name === "PrismaClientInitializationError") return true;

  if (name === "DriverAdapterError" && typeof cause === "object" && cause !== null) {
    const payload = cause as { kind?: unknown; message?: unknown };
    if (typeof payload.kind !== "string") return false;
    if (RETRYABLE_ADAPTER_KINDS.has(payload.kind)) return true;
    return (
      payload.kind === "postgres" &&
      typeof payload.message === "string" &&
      CONNECT_FAILURE.test(payload.message)
    );
  }

  return false;
}

function adapterErrorOf(link: object): unknown {
  const { meta } = link as { meta?: unknown };
  if (typeof meta !== "object" || meta === null) return undefined;
  return (meta as { driverAdapterError?: unknown }).driverAdapterError;
}

export function isRetryableConnectionError(error: unknown): boolean {
  const pending: unknown[] = [error];
  for (let inspected = 0; inspected < MAX_LINKS && pending.length > 0; inspected++) {
    const link = pending.shift();
    if (typeof link !== "object" || link === null) continue;
    if (isRetryableLink(link)) return true;
    // `DriverAdapterError.cause` is the mapped payload object rather than an
    // Error, so following it terminates the walk by itself.
    pending.push((link as { cause?: unknown }).cause, adapterErrorOf(link));
  }
  return false;
}

export async function withConnectionRetry<T>(
  run: () => Promise<T>,
  context: { model?: string; operation?: string },
  delaysMs: readonly number[] = RETRY_DELAYS_MS
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined || !isRetryableConnectionError(error)) throw error;
      // Never log query arguments — they carry the user's own writing.
      logger.warn("Retrying database operation after transient connection failure", {
        ...context,
        attempt: attempt + 1,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
