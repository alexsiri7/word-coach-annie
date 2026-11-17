import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isEmailAllowed } from "@/lib/auth";

describe("isEmailAllowed", () => {
    let origAllowedEmails: string | undefined;

    beforeEach(() => {
        origAllowedEmails = process.env.ALLOWED_EMAILS;
    });

    afterEach(() => {
        if (origAllowedEmails !== undefined) process.env.ALLOWED_EMAILS = origAllowedEmails;
        else delete process.env.ALLOWED_EMAILS;
    });

    it("allows any email when ALLOWED_EMAILS is unset", () => {
        delete process.env.ALLOWED_EMAILS;
        expect(isEmailAllowed("anyone@x.com")).toBe(true);
    });

    it("allows listed emails case-insensitively and trims whitespace in the list", () => {
        process.env.ALLOWED_EMAILS = "Alice@Example.com, bob@example.com ";
        expect(isEmailAllowed("alice@example.com")).toBe(true);
        expect(isEmailAllowed("ALICE@EXAMPLE.COM")).toBe(true);
        expect(isEmailAllowed("bob@example.com")).toBe(true);
    });

    it("denies emails not on the list, without substring matching", () => {
        process.env.ALLOWED_EMAILS = "Alice@Example.com, bob@example.com ";
        expect(isEmailAllowed("carol@example.com")).toBe(false);
        expect(isEmailAllowed("alice@example.com.evil.com")).toBe(false);
    });

    it("does not trim the input email (pinning today's behavior, not asserting it's ideal)", () => {
        process.env.ALLOWED_EMAILS = "alice@example.com";
        expect(isEmailAllowed("ALICE@example.com ")).toBe(false);
    });
});
