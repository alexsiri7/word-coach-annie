import { randomUUID } from "crypto";

type LogLevel = "error" | "warn" | "info";

/** Generate a unique request ID. */
export function generateRequestId(): string {
  return randomUUID();
}

function formatLog(
  level: LogLevel,
  message: string,
  meta?: unknown,
  context?: Record<string, unknown>
): void {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context) {
    Object.assign(entry, context);
  }

  if (meta !== undefined) {
    entry.error =
      meta instanceof Error
        ? { message: meta.message, stack: meta.stack }
        : meta;
  }

  const json = JSON.stringify(entry);
  if (level === "error") {
    console.error(json);
  } else if (level === "warn") {
    console.warn(json);
  } else {
    console.log(json);
  }
}

export const logger = {
  error: (message: string, meta?: unknown) => formatLog("error", message, meta),
  warn: (message: string, meta?: unknown) => formatLog("warn", message, meta),
  info: (message: string, meta?: unknown) => formatLog("info", message, meta),
};

/** Log an HTTP request with structured context. */
export function logRequest(opts: {
  request_id: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  user_id?: string;
}): void {
  formatLog("info", `${opts.method} ${opts.path}`, undefined, {
    request_id: opts.request_id,
    method: opts.method,
    path: opts.path,
    status: opts.status,
    duration_ms: opts.duration_ms,
    ...(opts.user_id ? { user_id: opts.user_id } : {}),
  });
}
