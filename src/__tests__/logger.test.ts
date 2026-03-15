import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger, generateRequestId, logRequest } from "@/lib/logger";

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

describe("generateRequestId", () => {
    it("returns a UUID string", () => {
        const id = generateRequestId();
        expect(id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
    });

    it("returns unique IDs on each call", () => {
        const a = generateRequestId();
        const b = generateRequestId();
        expect(a).not.toBe(b);
    });
});

describe("logRequest", () => {
    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("logs structured request info with all fields", () => {
        logRequest({
            request_id: "req-123",
            method: "GET",
            path: "/api/projects",
            status: 200,
            duration_ms: 42,
            user_id: "user-1",
        });

        expect(console.log).toHaveBeenCalledOnce();
        const output = JSON.parse(
            (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
        );
        expect(output.level).toBe("info");
        expect(output.request_id).toBe("req-123");
        expect(output.method).toBe("GET");
        expect(output.path).toBe("/api/projects");
        expect(output.status).toBe(200);
        expect(output.duration_ms).toBe(42);
        expect(output.user_id).toBe("user-1");
        expect(output.timestamp).toBeDefined();
    });

    it("omits user_id when not provided", () => {
        logRequest({
            request_id: "req-456",
            method: "POST",
            path: "/api/chat",
            status: 201,
            duration_ms: 100,
        });

        const output = JSON.parse(
            (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]
        );
        expect(output.user_id).toBeUndefined();
        expect(output.request_id).toBe("req-456");
    });
});
