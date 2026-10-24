import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { beforeBreadcrumb, beforeSend, dataCollection } from "@/lib/sentry-scrub";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    event_id: "test-event",
    ...overrides,
  } as ErrorEvent;
}

describe("sentry-scrub beforeSend", () => {
  it("redacts password fields in extra", () => {
    const event = makeEvent({ extra: { password: "hunter2", safe: "ok" } });
    const result = beforeSend(event)!;
    expect(result.extra!.password).toBe("[REDACTED]");
    expect(result.extra!.safe).toBe("ok");
  });

  it("redacts token fields case-insensitively", () => {
    const event = makeEvent({ extra: { Token: "abc", ACCESS_TOKEN: "xyz" } });
    const result = beforeSend(event)!;
    expect(result.extra!.Token).toBe("[REDACTED]");
    expect(result.extra!.ACCESS_TOKEN).toBe("[REDACTED]");
  });

  it("redacts api_key and apiKey variants", () => {
    const event = makeEvent({ extra: { api_key: "k1", apiKey: "k2", "API-KEY": "k3" } });
    const result = beforeSend(event)!;
    expect(result.extra!.api_key).toBe("[REDACTED]");
    expect(result.extra!.apiKey).toBe("[REDACTED]");
    expect(result.extra!["API-KEY"]).toBe("[REDACTED]");
  });

  it("truncates strings longer than 2000 chars", () => {
    const longString = "x".repeat(3000);
    const event = makeEvent({ extra: { detail: longString } });
    const result = beforeSend(event);
    const truncated = result.extra!.detail as string;
    expect(truncated).toHaveLength(2000 + "…[truncated]".length);
    expect(truncated.endsWith("…[truncated]")).toBe(true);
  });

  it("respects depth limit of 6 — nested objects at depth 7 pass through unredacted", () => {
    // Build a nested object 7 levels deep with a sensitive key at the bottom
    let obj: Record<string, unknown> = { secret: "should-remain" };
    for (let i = 0; i < 6; i++) {
      obj = { nested: obj };
    }
    const event = makeEvent({ extra: { deep: obj } });
    const result = beforeSend(event)!;

    // Walk down to find the deepest object
    let current: unknown = result.extra!.deep;
    for (let i = 0; i < 6; i++) {
      current = (current as Record<string, unknown>).nested;
    }
    // At depth 7, redact() returns the node unchanged
    expect((current as Record<string, unknown>).secret).toBe("should-remain");
  });

  it("redacts event.request.cookies to [REDACTED]", () => {
    const event = makeEvent({
      request: { url: "http://localhost", cookies: { session: "abc" } },
    });
    const result = beforeSend(event)!;
    expect(result.request!.cookies).toBe("[REDACTED]");
  });

  it("redacts authorization and cookie headers", () => {
    const event = makeEvent({
      request: {
        url: "http://localhost",
        headers: { authorization: "Bearer secret", cookie: "session=abc", "content-type": "text/html" },
      },
    });
    const result = beforeSend(event)!;
    expect(result.request!.headers!.authorization).toBe("[REDACTED]");
    expect(result.request!.headers!.cookie).toBe("[REDACTED]");
    expect(result.request!.headers!["content-type"]).toBe("text/html");
  });

  it("preserves non-sensitive keys untouched", () => {
    const event = makeEvent({ extra: { userId: "u1", action: "click", count: 42 } });
    const result = beforeSend(event)!;
    expect(result.extra!.userId).toBe("u1");
    expect(result.extra!.action).toBe("click");
    expect(result.extra!.count).toBe(42);
  });

  it("handles null/undefined values in extra without throwing", () => {
    const event = makeEvent({ extra: { a: null, b: undefined, c: "ok" } });
    const result = beforeSend(event)!;
    expect(result.extra!.a).toBeNull();
    expect(result.extra!.b).toBeUndefined();
    expect(result.extra!.c).toBe("ok");
  });

  it("redacts sensitive keys inside array elements in extra", () => {
    const event = makeEvent({
      extra: { items: [{ token: "abc", name: "foo" }, { secret: "xyz" }] },
    });
    const result = beforeSend(event)!;
    const items = result.extra!.items as Array<Record<string, unknown>>;
    expect(items[0].token).toBe("[REDACTED]");
    expect(items[0].name).toBe("foo");
    expect(items[1].secret).toBe("[REDACTED]");
  });

  it("redacts manuscript-derived keys under the logger's meta wrapper", () => {
    const event = makeEvent({
      extra: {
        meta: { raw: "peer review", body: "{}", content: "c", message: "m", text: "t", status: 500 },
      },
    });
    const meta = beforeSend(event).extra!.meta as Record<string, unknown>;
    for (const k of ["raw", "body", "content", "message", "text"]) {
      expect(meta[k], k).toBe("[REDACTED]");
    }
    expect(meta.status).toBe(500);
  });

  it("masks email addresses in event.message and exception values", () => {
    const event = makeEvent({
      message: "No account for jane.doe@example.com or a@x.com",
      exception: {
        values: [
          { type: "Error", value: "Invite to a+b@x.co failed" },
          { type: "Error", value: "cause: c@y.org, d@z.net" },
        ],
      },
    });
    const result = beforeSend(event);
    expect(result.message).toBe("No account for [EMAIL] or [EMAIL]");
    expect(result.exception!.values![0].value).toBe("Invite to [EMAIL] failed");
    expect(result.exception!.values![1].value).toBe("cause: [EMAIL], [EMAIL]");
  });

  it("keeps the logger's diagnostic label on Error-path captures", () => {
    const event = makeEvent({ extra: { label: "verifyRefreshToken: unexpected error" } });
    expect(beforeSend(event).extra!.label).toBe("verifyRefreshToken: unexpected error");
  });

  it("redacts x-user-email and x-user-id headers", () => {
    const event = makeEvent({
      request: {
        url: "http://localhost",
        headers: { "x-user-email": "jane@example.com", "X-User-Id": "u1", accept: "*/*" },
      },
    });
    const headers = beforeSend(event).request!.headers!;
    expect(headers["x-user-email"]).toBe("[REDACTED]");
    expect(headers["X-User-Id"]).toBe("[REDACTED]");
    expect(headers.accept).toBe("*/*");
  });

  it("returns empty event unchanged", () => {
    const event = makeEvent({});
    const result = beforeSend(event)!;
    expect(result.event_id).toBe("test-event");
  });

  it("redacts email fields in contexts", () => {
    const event = makeEvent({
      contexts: { user: { email: "user@example.com", name: "Test" } } as ErrorEvent["contexts"],
    });
    const result = beforeSend(event)!;
    expect((result.contexts!.user as Record<string, unknown>).email).toBe("[REDACTED]");
    expect((result.contexts!.user as Record<string, unknown>).name).toBe("Test");
  });
});

describe("sentry-scrub beforeBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(beforeBreadcrumb({ category: "console", message: "body" })).toBeNull();
  });

  it("keeps other breadcrumbs", () => {
    const crumb = { category: "navigation", data: { to: "/" } };
    expect(beforeBreadcrumb(crumb)).toBe(crumb);
  });

  it("is passed to every Sentry.init config", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["sentry.server.config.ts", "sentry.edge.config.ts", "sentry.client.config.ts"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/^\s*beforeBreadcrumb,\s*$/m);
    }
  });
});

describe("sentry-scrub beforeSend MCP protocol-version negotiation", () => {
  const mismatch =
    "Bad Request: Unsupported protocol version: 2026-07-28 (supported versions: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07)";

  it("drops the SDK's unsupported-protocol-version exception", () => {
    const event = makeEvent({ exception: { values: [{ type: "Error", value: mismatch }] } });
    expect(beforeSend(event)).toBeNull();
  });

  it("drops the unsupported-protocol-version message event", () => {
    expect(beforeSend(makeEvent({ message: mismatch }))).toBeNull();
  });

  it("keeps other MCP transport errors", () => {
    const event = makeEvent({
      exception: { values: [{ type: "Error", value: "Invalid Host header: evil.com" }] },
    });
    expect(beforeSend(event)).toBe(event);
  });
});

// Sentry v11 collects bodies, cookies, user info, DB queries and GenAI I/O by
// default when `dataCollection` is unset. Request bodies carry manuscript text,
// so the restrictive v10 (`sendDefaultPii: false`) baseline must stay pinned.
describe("sentry-scrub dataCollection", () => {
  it("keeps the restrictive v10 baseline", () => {
    expect(dataCollection.userInfo).toBe(false);
    expect(dataCollection.cookies).toBe(false);
    expect(dataCollection.httpBodies).toEqual([]);
    expect(dataCollection.databaseQueryData).toBe(false);
    expect(dataCollection.queues).toBe(false);
    expect(dataCollection.genAI).toEqual({ inputs: false, outputs: false });
    expect(dataCollection.graphQL).toEqual({ document: false, variables: false });
  });

  it("is passed to every Sentry.init config", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["sentry.server.config.ts", "sentry.edge.config.ts", "sentry.client.config.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/^\s*dataCollection,\s*$/m);
      expect(src, f).not.toMatch(/^\s*sendDefaultPii\s*:/m);
    }
  });
});
