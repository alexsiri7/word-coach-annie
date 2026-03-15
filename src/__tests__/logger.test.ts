import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
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
});
