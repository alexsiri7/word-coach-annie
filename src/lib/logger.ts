type LogLevel = "error" | "warn" | "info";

function formatLog(level: LogLevel, message: string, meta?: unknown): void {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

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
