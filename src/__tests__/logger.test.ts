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

    it("includes Error metadata with message and stack", () => {
        const err = new Error("test error");
        logger.error("failed", err);
        const output = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.error.message).toBe("test error");
        expect(output.error.stack).toBeDefined();
    });

    it("includes non-Error metadata as-is", () => {
        logger.warn("details", { code: 42, reason: "timeout" });
        const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.error).toEqual({ code: 42, reason: "timeout" });
    });

    it("omits error field when no metadata provided", () => {
        logger.info("clean");
        const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
        expect(output.error).toBeUndefined();
    });

    it("reports Error instances to Sentry via captureException", () => {
        const err = new Error("sentry test");
        logger.error("crashed", err);
        expect(Sentry.captureException).toHaveBeenCalledWith(err, {
            extra: { message: "crashed" },
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
