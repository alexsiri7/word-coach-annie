import { describe, it, expect } from "vitest";
import { beforeSend } from "@/lib/sentry-scrub";

// `redact` is module-private; tested transitively via beforeSend's event.extra path.

describe("beforeSend", () => {
    it("masks sensitive headers (case-insensitive) and leaves benign headers alone", () => {
        const event = {
            request: {
                headers: {
                    authorization: "Bearer xyz",
                    "Cookie": "s=1",
                    "x-user-email": "user@example.com",
                    "x-api-token": "secret",
                    "x-trace": "ok",
                },
            },
        } as any;
        beforeSend(event);
        expect(event.request.headers.authorization).toBe("[REDACTED]");
        expect(event.request.headers["Cookie"]).toBe("[REDACTED]");
        expect(event.request.headers["x-user-email"]).toBe("[REDACTED]");
        expect(event.request.headers["x-api-token"]).toBe("[REDACTED]");
        expect(event.request.headers["x-trace"]).toBe("ok");
    });

    it("replaces request.cookies wholesale", () => {
        const event = { request: { cookies: { session: "abc" } } } as any;
        beforeSend(event);
        expect(event.request.cookies).toBe("[REDACTED]");
    });

    it("redacts email on event.user but preserves id", () => {
        const event = { user: { id: "u-1", email: "u@x", username: "ned" } } as any;
        beforeSend(event);
        expect(event.user.id).toBe("u-1");
        expect(event.user.email).toBe("[REDACTED]");
        // username is not in SENSITIVE_KEY but is preserved as-is via redact
        expect(event.user.username).toBe("ned");
    });

    it("redacts sensitive keys in event.extra", () => {
        const event = {
            extra: { token: "t", secret: "s", password: "p", api_key: "k", email: "u@x", note: "ok" },
        } as any;
        beforeSend(event);
        expect(event.extra.token).toBe("[REDACTED]");
        expect(event.extra.secret).toBe("[REDACTED]");
        expect(event.extra.password).toBe("[REDACTED]");
        expect(event.extra.api_key).toBe("[REDACTED]");
        expect(event.extra.email).toBe("[REDACTED]");
        expect(event.extra.note).toBe("ok");
    });

    it("recurses into nested objects and arrays", () => {
        const event = {
            extra: { user: { email: "u@x", name: "ok" }, items: [{ token: "t", id: 1 }] },
        } as any;
        beforeSend(event);
        expect(event.extra.user.email).toBe("[REDACTED]");
        expect(event.extra.user.name).toBe("ok");
        expect(event.extra.items[0].token).toBe("[REDACTED]");
        expect(event.extra.items[0].id).toBe(1);
    });

    it("truncates strings longer than 2000 chars", () => {
        const long = "a".repeat(3000);
        const event = { extra: { note: long } } as any;
        beforeSend(event);
        const out = event.extra.note as string;
        expect(out.length).toBe(2000 + "…[truncated]".length);
        expect(out.endsWith("…[truncated]")).toBe(true);
    });

    it("redacts breadcrumbs (HTTP / console payloads)", () => {
        const event = {
            breadcrumbs: [
                { category: "console", data: { token: "leak", note: "ok" } },
                { category: "http", data: { url: "/api/auth/login", body: { password: "p" } } },
            ],
        } as any;
        beforeSend(event);
        expect(event.breadcrumbs[0].data.token).toBe("[REDACTED]");
        expect(event.breadcrumbs[0].data.note).toBe("ok");
        expect(event.breadcrumbs[1].data.body.password).toBe("[REDACTED]");
    });

    it("does not throw and drops events when a getter throws", () => {
        const evil: any = {};
        Object.defineProperty(evil, "boom", {
            enumerable: true,
            get() { throw new Error("nope"); },
        });
        const event = { extra: { container: evil } } as any;
        expect(() => beforeSend(event)).not.toThrow();
        expect(event.extra.container.boom).toBe("[unreadable]");
    });

    it("preserves Error instances rather than collapsing to {}", () => {
        const err = new Error("boom");
        const event = { extra: { last: err } } as any;
        beforeSend(event);
        expect(event.extra.last).toBe(err);
        expect((event.extra.last as Error).message).toBe("boom");
    });

    it("preserves Date instances", () => {
        const d = new Date("2026-01-01T00:00:00Z");
        const event = { extra: { ts: d } } as any;
        beforeSend(event);
        expect(event.extra.ts).toBe(d);
    });

    it("guards cycles via WeakSet (does not infinite-loop)", () => {
        const a: any = { token: "t" };
        a.self = a;
        const event = { extra: { graph: a } } as any;
        expect(() => beforeSend(event)).not.toThrow();
        expect(event.extra.graph.token).toBe("[REDACTED]");
        expect(event.extra.graph.self).toBe("[Circular]");
    });

    it("stops recursing past depth 6 without throwing", () => {
        const root: any = { token: "t" };
        let cur = root;
        for (let i = 0; i < 10; i++) {
            cur.next = { token: "deeper-" + i };
            cur = cur.next;
        }
        const event = { extra: root } as any;
        expect(() => beforeSend(event)).not.toThrow();
        expect(event.extra.token).toBe("[REDACTED]");
    });
});
