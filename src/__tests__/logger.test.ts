import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

describe("logger", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.mocked(Sentry.captureException).mockClear();
        vi.mocked(Sentry.captureMessage).mockClear();
    });

    it("logs error messages as JSON to console.error", () => {
        logger.error("something broke");
        expect(console.error).toHaveBeenCalledOnce();
        const output = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.level).toBe("error");
        expect(output.message).toBe("something broke");
        expect(output.timestamp).toBeDefined();
    });

    it("logs warn messages to console.warn", () => {
        logger.warn("careful");
        expect(console.warn).toHaveBeenCalledOnce();
        const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.level).toBe("warn");
        expect(output.message).toBe("careful");
    });

    it("logs info messages to console.log", () => {
        logger.info("status update");
        expect(console.log).toHaveBeenCalledOnce();
        const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.level).toBe("info");
        expect(output.message).toBe("status update");
    });

    it("logs an Error's name, code and stack frames but not its message", () => {
        const err = Object.assign(
            new Error("Hashnode API error (502): duplicate slug 'my-secret-chapter-title'"),
            { code: "UPSTREAM" },
        );
        logger.error("publish failed", err);
        const line = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(line).not.toContain("my-secret-chapter-title");
        const output = JSON.parse(line);
        expect(output.error).toMatchObject({ name: "Error", code: "UPSTREAM", message: "[REDACTED]" });
        expect(output.error.stack).toMatch(/^\s+at /);
        expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: { label: "publish failed" } });
    });

    it("redacts stringified and nested errors in metadata", () => {
        const upstream = new Error("Object storage PUT failed: 502 <html>upstream secret body</html>");
        logger.warn("cleanup failed", { count: 3, error: String(upstream), err: upstream });
        const line = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(line).not.toContain("upstream secret body");
        const output = JSON.parse(line);
        expect(output.error).toMatchObject({ count: 3, error: "[REDACTED]", err: { name: "Error", message: "[REDACTED]" } });
    });

    it("keeps diagnostic names that are not stringified errors", () => {
        logger.warn("rewrite failed", { field: "apiKey", errorName: "PrismaClientKnownRequestError" });
        const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.error).toEqual({ field: "apiKey", errorName: "PrismaClientKnownRequestError" });
    });

    it("keeps identifiers and counts whose keys resemble sensitive names", () => {
        logger.warn("token client mismatch", {
            tokenClientId: "client-abc",
            tokenId: "t1",
            revokedTokens: 4,
            messageCount: 12,
            accessToken: "secret-value",
        });
        const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.error).toEqual({
            tokenClientId: "client-abc",
            tokenId: "t1",
            revokedTokens: 4,
            messageCount: 12,
            accessToken: "[REDACTED]",
        });
    });

    it("includes non-Error metadata as-is", () => {
        logger.warn("details", { code: 42, reason: "timeout" });
        const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.error).toEqual({ code: 42, reason: "timeout" });
    });

    it("redacts manuscript-derived and upstream body fields from console output", () => {
        logger.error("AI response parse failed", {
            projectId: "p1",
            rawContent: "She walked into the rain",
            upstream: { status: 502, body: "<html>Bad gateway</html>" },
        });
        const line = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(line).not.toContain("She walked into the rain");
        expect(line).not.toContain("Bad gateway");
        expect(JSON.parse(line).error).toEqual({
            projectId: "p1",
            rawContent: "[REDACTED]",
            upstream: { status: 502, body: "[REDACTED]" },
        });
    });

    it("masks emails in console messages", () => {
        logger.warn("lookup for jane@example.com failed", new Error("no user jane@example.com"));
        const line = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(line).not.toContain("jane@example.com");
        expect(JSON.parse(line).message).toBe("lookup for [EMAIL] failed");
    });

    it("masks emails in linear time on long runs of local-part characters", () => {
        logger.info("%".repeat(200_000) + " jane@example.com");
        const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.message.endsWith(" [EMAIL]")).toBe(true);
    }, 1000);

    it("omits error field when no metadata provided", () => {
        logger.info("clean");
        const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.error).toBeUndefined();
    });

    it("reports Error instances to Sentry via captureException", () => {
        const err = new Error("sentry test");
        logger.error("crashed", err);
        expect(Sentry.captureException).toHaveBeenCalledWith(err, {
            extra: { label: "crashed" },
        });
    });

    it("reports non-Error errors to Sentry via captureMessage", () => {
        logger.error("something failed", { code: 500 });
        expect(Sentry.captureMessage).toHaveBeenCalledWith("something failed", {
            level: "error",
            extra: { meta: { code: 500 } },
        });
    });

    it("reports errors without meta to Sentry via captureMessage", () => {
        logger.error("plain error");
        expect(Sentry.captureMessage).toHaveBeenCalledWith("plain error", {
            level: "error",
            extra: undefined,
        });
    });

    it("does not report warn or info to Sentry", () => {
        logger.warn("just a warning");
        logger.info("just info");
        expect(Sentry.captureException).not.toHaveBeenCalled();
        expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
});
