import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { beforeSend } from "@/lib/sentry-scrub";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    event_id: "test-event",
    ...overrides,
  } as ErrorEvent;
}

describe("sentry-scrub beforeSend", () => {
  it("redacts password fields in extra", () => {
    const event = makeEvent({ extra: { password: "hunter2", safe: "ok" } });
    const result = beforeSend(event);
    expect(result.extra!.password).toBe("[REDACTED]");
    expect(result.extra!.safe).toBe("ok");
  });

  it("redacts token fields case-insensitively", () => {
    const event = makeEvent({ extra: { Token: "abc", ACCESS_TOKEN: "xyz" } });
    const result = beforeSend(event);
    expect(result.extra!.Token).toBe("[REDACTED]");
    expect(result.extra!.ACCESS_TOKEN).toBe("[REDACTED]");
  });

  it("redacts api_key and apiKey variants", () => {
    const event = makeEvent({ extra: { api_key: "k1", apiKey: "k2", "API-KEY": "k3" } });
    const result = beforeSend(event);
    expect(result.extra!.api_key).toBe("[REDACTED]");
    expect(result.extra!.apiKey).toBe("[REDACTED]");
    expect(result.extra!["API-KEY"]).toBe("[REDACTED]");
  });

  it("truncates strings longer than 2000 chars", () => {
    const longString = "x".repeat(3000);
    const event = makeEvent({ extra: { message: longString } });
    const result = beforeSend(event);
    const truncated = result.extra!.message as string;
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
    const result = beforeSend(event);

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
    const result = beforeSend(event);
    expect(result.request!.cookies).toBe("[REDACTED]");
  });

  it("redacts authorization and cookie headers", () => {
    const event = makeEvent({
      request: {
        url: "http://localhost",
        headers: { authorization: "Bearer secret", cookie: "session=abc", "content-type": "text/html" },
      },
    });
    const result = beforeSend(event);
    expect(result.request!.headers!.authorization).toBe("[REDACTED]");
    expect(result.request!.headers!.cookie).toBe("[REDACTED]");
    expect(result.request!.headers!["content-type"]).toBe("text/html");
  });

  it("preserves non-sensitive keys untouched", () => {
    const event = makeEvent({ extra: { userId: "u1", action: "click", count: 42 } });
    const result = beforeSend(event);
    expect(result.extra!.userId).toBe("u1");
    expect(result.extra!.action).toBe("click");
    expect(result.extra!.count).toBe(42);
  });

  it("handles null/undefined values in extra without throwing", () => {
    const event = makeEvent({ extra: { a: null, b: undefined, c: "ok" } });
    const result = beforeSend(event);
    expect(result.extra!.a).toBeNull();
    expect(result.extra!.b).toBeUndefined();
    expect(result.extra!.c).toBe("ok");
  });

  it("redacts sensitive keys inside array elements in extra", () => {
    const event = makeEvent({
      extra: { items: [{ token: "abc", name: "foo" }, { secret: "xyz" }] },
    });
    const result = beforeSend(event);
    const items = result.extra!.items as Array<Record<string, unknown>>;
    expect(items[0].token).toBe("[REDACTED]");
    expect(items[0].name).toBe("foo");
    expect(items[1].secret).toBe("[REDACTED]");
  });

  it("returns empty event unchanged", () => {
    const event = makeEvent({});
    const result = beforeSend(event);
    expect(result.event_id).toBe("test-event");
  });

  it("redacts email fields in contexts", () => {
    const event = makeEvent({
      contexts: { user: { email: "user@example.com", name: "Test" } } as ErrorEvent["contexts"],
    });
    const result = beforeSend(event);
    expect((result.contexts!.user as Record<string, unknown>).email).toBe("[REDACTED]");
    expect((result.contexts!.user as Record<string, unknown>).name).toBe("Test");
  });
});
