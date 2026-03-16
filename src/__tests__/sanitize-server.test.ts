import { describe, it, expect } from "vitest";
import { sanitizeInput } from "@/lib/sanitize-server";

describe("sanitizeInput", () => {
    it("strips HTML tags from input", () => {
        expect(sanitizeInput("<script>alert('xss')</script>")).toBe("alert('xss')");
        expect(sanitizeInput("<b>bold</b>")).toBe("bold");
        expect(sanitizeInput("plain text")).toBe("plain text");
    });

    it("handles empty string", () => {
        expect(sanitizeInput("")).toBe("");
    });
});
