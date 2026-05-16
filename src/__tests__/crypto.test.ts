import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";

describe("crypto", () => {
    let origEncKey: string | undefined;
    let origApiToken: string | undefined;

    beforeEach(() => {
        origEncKey = process.env.ENCRYPTION_KEY;
        origApiToken = process.env.API_TOKEN;
    });

    afterEach(() => {
        if (origEncKey !== undefined) process.env.ENCRYPTION_KEY = origEncKey;
        else delete process.env.ENCRYPTION_KEY;
        if (origApiToken !== undefined) process.env.API_TOKEN = origApiToken;
        else delete process.env.API_TOKEN;
    });

    describe("with ENCRYPTION_KEY set", () => {
        beforeEach(() => {
            process.env.ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";
        });

        it("encrypts and decrypts a value round-trip", () => {
            const plaintext = "sk-abc123xyz789";
            const encrypted = encrypt(plaintext);
            expect(encrypted).not.toBe(plaintext);
            expect(isEncrypted(encrypted)).toBe(true);
            expect(decrypt(encrypted)).toBe(plaintext);
        });

        it("produces different ciphertexts for same plaintext (random IV)", () => {
            const plaintext = "sk-test-key";
            const a = encrypt(plaintext);
            const b = encrypt(plaintext);
            expect(a).not.toBe(b); // Different IVs
            expect(decrypt(a)).toBe(plaintext);
            expect(decrypt(b)).toBe(plaintext);
        });

        it("returns empty string for empty input", () => {
            expect(encrypt("")).toBe("");
            expect(decrypt("")).toBe("");
        });

        it("encrypted format has correct prefix", () => {
            const encrypted = encrypt("test");
            expect(encrypted.startsWith("enc:v1:")).toBe(true);
        });

        it("handles unicode content", () => {
            const plaintext = "key-with-unicode-\u{1F512}";
            const encrypted = encrypt(plaintext);
            expect(decrypt(encrypted)).toBe(plaintext);
        });
    });

    describe("with API_TOKEN fallback", () => {
        beforeEach(() => {
            delete process.env.ENCRYPTION_KEY;
            process.env.API_TOKEN = "fallback-api-token";
        });

        it("uses API_TOKEN when ENCRYPTION_KEY is not set", () => {
            const plaintext = "sk-secret";
            const encrypted = encrypt(plaintext);
            expect(isEncrypted(encrypted)).toBe(true);
            expect(decrypt(encrypted)).toBe(plaintext);
        });
    });

    describe("without any key", () => {
        beforeEach(() => {
            delete process.env.ENCRYPTION_KEY;
            delete process.env.API_TOKEN;
        });

        afterEach(() => {
            // vitest isolates modules per file, so deleting is safe here
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
        });

        it("throws when ALLOW_PLAINTEXT_STORAGE is not set", () => {
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
            expect(() => encrypt("sk-no-encryption")).toThrow(
                "ENCRYPTION_KEY or API_TOKEN must be set"
            );
        });

        it("throws on decrypt when ALLOW_PLAINTEXT_STORAGE is not set", () => {
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
            expect(() => decrypt("enc:v1:aabbcc:ddeeff00112233445566778899aabbccddeeff")).toThrow(
                "ENCRYPTION_KEY or API_TOKEN must be set"
            );
        });

        it("returns plaintext when ALLOW_PLAINTEXT_STORAGE=true", () => {
            process.env.ALLOW_PLAINTEXT_STORAGE = "true";
            const plaintext = "sk-no-encryption";
            expect(encrypt(plaintext)).toBe(plaintext);
            expect(decrypt(plaintext)).toBe(plaintext);
        });
    });

    describe("isEncrypted", () => {
        it("detects encrypted values", () => {
            expect(isEncrypted("enc:v1:aabbcc:ddeeff")).toBe(true);
        });

        it("rejects plaintext", () => {
            expect(isEncrypted("sk-plaintext")).toBe(false);
            expect(isEncrypted("")).toBe(false);
        });
    });

    describe("decrypt handles non-encrypted values gracefully", () => {
        beforeEach(() => {
            process.env.ENCRYPTION_KEY = "test-key";
        });

        it("returns plaintext values unchanged", () => {
            expect(decrypt("sk-plaintext-key")).toBe("sk-plaintext-key");
        });
    });
});
