import { describe, it, expect } from "vitest";
import { getClientIp } from "@/lib/client-ip";

describe("getClientIp", () => {
    it("returns the trimmed x-real-ip", () => {
        expect(getClientIp(new Headers({ "x-real-ip": " 1.2.3.4 " }))).toBe("1.2.3.4");
    });

    it("ignores x-forwarded-for and cf-connecting-ip when x-real-ip is present", () => {
        const headers = new Headers({
            "x-real-ip": "1.2.3.4",
            "x-forwarded-for": "6.6.6.6, 1.2.3.4",
            "cf-connecting-ip": "7.7.7.7",
        });
        expect(getClientIp(headers)).toBe("1.2.3.4");
    });

    it("returns anon when only client-controlled headers are present", () => {
        const headers = new Headers({
            "x-forwarded-for": "6.6.6.6",
            "cf-connecting-ip": "7.7.7.7",
        });
        expect(getClientIp(headers)).toBe("anon");
    });

    it("returns anon when x-real-ip is empty or whitespace", () => {
        expect(getClientIp(new Headers({ "x-real-ip": "" }))).toBe("anon");
        expect(getClientIp(new Headers({ "x-real-ip": "   " }))).toBe("anon");
    });
});
