import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { encrypt, decrypt, isEncrypted, isUndecryptable, readEncrypted } from "@/lib/crypto";
import { logger } from "@/lib/logger";

const SRC = join(__dirname, "..");

function productionSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : productionSources(path);
        return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

describe("crypto", () => {
    let origEncKey: string | undefined;
    let origApiToken: string | undefined;
    let origPrevious: string | undefined;

    beforeEach(() => {
        origEncKey = process.env.ENCRYPTION_KEY;
        origApiToken = process.env.API_TOKEN;
        origPrevious = process.env.ENCRYPTION_KEY_PREVIOUS;
    });

    afterEach(() => {
        if (origEncKey !== undefined) process.env.ENCRYPTION_KEY = origEncKey;
        else delete process.env.ENCRYPTION_KEY;
        if (origApiToken !== undefined) process.env.API_TOKEN = origApiToken;
        else delete process.env.API_TOKEN;
        if (origPrevious !== undefined) process.env.ENCRYPTION_KEY_PREVIOUS = origPrevious;
        else delete process.env.ENCRYPTION_KEY_PREVIOUS;
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

    describe("with API_TOKEN set but no ENCRYPTION_KEY", () => {
        beforeEach(() => {
            delete process.env.ENCRYPTION_KEY;
            process.env.API_TOKEN = "some-api-token";
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
        });

        afterEach(() => {
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
        });

        it("throws even when API_TOKEN is set — API_TOKEN must not be used as encryption key", () => {
            expect(() => encrypt("sk-secret")).toThrow("ENCRYPTION_KEY must be set");
        });
    });

    describe("without any key", () => {
        beforeEach(() => {
            delete process.env.ENCRYPTION_KEY;
            delete process.env.API_TOKEN;
        });

        afterEach(() => {
            // setup.ts sets ALLOW_PLAINTEXT_STORAGE=true globally; unset here so
            // throw-by-default tests below are not masked by the global default.
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
        });

        it("throws when ALLOW_PLAINTEXT_STORAGE is not set", () => {
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
            expect(() => encrypt("sk-no-encryption")).toThrow("ENCRYPTION_KEY must be set");
        });

        it("throws on decrypt when ALLOW_PLAINTEXT_STORAGE is not set", () => {
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
            expect(() => decrypt("enc:v1:aabbcc:ddeeff00112233445566778899aabbccddeeff")).toThrow(
                "ENCRYPTION_KEY must be set"
            );
        });

        it("returns plaintext when ALLOW_PLAINTEXT_STORAGE=true", () => {
            process.env.ALLOW_PLAINTEXT_STORAGE = "true";
            const plaintext = "sk-no-encryption";
            expect(encrypt(plaintext)).toBe(plaintext);
            expect(decrypt(plaintext)).toBe(plaintext);
        });

        it("throws when ALLOW_PLAINTEXT_STORAGE is '1' (strict string check)", () => {
            process.env.ALLOW_PLAINTEXT_STORAGE = "1";
            expect(() => encrypt("sk-test")).toThrow("ENCRYPTION_KEY must be set");
        });

        it("throws when ALLOW_PLAINTEXT_STORAGE is 'TRUE' (case-sensitive check)", () => {
            process.env.ALLOW_PLAINTEXT_STORAGE = "TRUE";
            expect(() => encrypt("sk-test")).toThrow("ENCRYPTION_KEY must be set");
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

    describe("key rotation", () => {
        const KEY_A = "rotation-key-a";
        const KEY_B = "rotation-key-b";

        function encryptUnder(key: string, plaintext: string): string {
            process.env.ENCRYPTION_KEY = key;
            delete process.env.ENCRYPTION_KEY_PREVIOUS;
            return encrypt(plaintext);
        }

        function decryptUnderOnly(key: string, value: string): string {
            process.env.ENCRYPTION_KEY = key;
            delete process.env.ENCRYPTION_KEY_PREVIOUS;
            return decrypt(value);
        }

        it("decrypts with a previous key and rewrites the value under the current key", async () => {
            const stored = encryptUnder(KEY_A, "sk-rotate-me");
            process.env.ENCRYPTION_KEY = KEY_B;
            process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

            expect(decrypt(stored)).toBe("sk-rotate-me");
            const rewrite = vi.fn(async (_reencrypted: string) => {});
            await expect(readEncrypted(stored, { field: "AiSettings.apiKey", rewrite })).resolves.toBe("sk-rotate-me");

            expect(rewrite).toHaveBeenCalledTimes(1);
            const rewritten = rewrite.mock.calls[0][0];
            expect(decryptUnderOnly(KEY_B, rewritten)).toBe("sk-rotate-me");
        });

        it("does not rewrite a value already under the current key", async () => {
            const stored = encryptUnder(KEY_B, "sk-current");
            process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
            const rewrite = vi.fn(async () => {});

            await expect(readEncrypted(stored, { field: "AiSettings.apiKey", rewrite })).resolves.toBe("sk-current");
            expect(rewrite).not.toHaveBeenCalled();
        });

        it("reads a value no configured key decrypts as null and never logs it", async () => {
            const stored = encryptUnder(KEY_A, "sk-lost");
            process.env.ENCRYPTION_KEY = KEY_B;
            const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
            const rewrite = vi.fn(async () => {});

            await expect(readEncrypted(stored, { field: "AiSettings.apiKey", rewrite })).resolves.toBeNull();
            expect(rewrite).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(warn.mock.calls)).not.toContain(stored.slice("enc:v1:".length));
            expect(() => decrypt(stored)).toThrow("GCM authentication failed");
            warn.mockRestore();
        });

        it("reads a malformed value as null", async () => {
            process.env.ENCRYPTION_KEY = KEY_B;
            const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
            await expect(readEncrypted("enc:v1:only-one-part", { field: "AiSettings.apiKey" })).resolves.toBeNull();
            warn.mockRestore();
        });

        it("ignores whitespace and empty entries in ENCRYPTION_KEY_PREVIOUS", async () => {
            const stored = encryptUnder(KEY_A, "sk-spaced");
            process.env.ENCRYPTION_KEY = KEY_B;
            process.env.ENCRYPTION_KEY_PREVIOUS = ` , ${KEY_A} ,`;

            expect(decrypt(stored)).toBe("sk-spaced");
            await expect(readEncrypted(stored, { field: "AiSettings.apiKey" })).resolves.toBe("sk-spaced");
        });

        it("still returns the plaintext when the rewrite fails", async () => {
            const stored = encryptUnder(KEY_A, "sk-rewrite-fails");
            process.env.ENCRYPTION_KEY = KEY_B;
            process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
            const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

            const rewrite = vi.fn(async () => { throw new Error("db down"); });
            await expect(readEncrypted(stored, { field: "AiSettings.apiKey", rewrite })).resolves.toBe("sk-rewrite-fails");
            expect(warn).toHaveBeenCalledTimes(1);
            warn.mockRestore();
        });

        it("reports only values no configured key decrypts as undecryptable, without logging them", () => {
            const underA = encryptUnder(KEY_A, "sk-a");
            const lost = encryptUnder("rotation-key-lost", "sk-lost");
            process.env.ENCRYPTION_KEY = KEY_B;
            process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
            const underB = encrypt("sk-b");
            const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

            expect(isUndecryptable(underA, "AiSettings.apiKey")).toBe(false);
            expect(isUndecryptable(underB, "AiSettings.apiKey")).toBe(false);
            expect(isUndecryptable("sk-legacy-plaintext", "AiSettings.apiKey")).toBe(false);
            expect(isUndecryptable("", "AiSettings.apiKey")).toBe(false);
            expect(warn).not.toHaveBeenCalled();

            expect(isUndecryptable(lost, "AiSettings.apiKey")).toBe(true);
            expect(isUndecryptable("enc:v1:only-one-part", "AiSettings.apiKey")).toBe(true);
            expect(warn).toHaveBeenCalledTimes(2);
            expect(JSON.stringify(warn.mock.calls)).not.toContain(lost.slice("enc:v1:".length));
            warn.mockRestore();
        });

        // Reads that bypass readEncrypted() are not tied to ENCRYPTED_COLUMNS by
        // the EncryptedField type, so reencrypt.mjs could miss their column.
        it("routes every production read of a stored secret through readEncrypted()", () => {
            const decryptCallers = productionSources(SRC)
                .filter((file) => !file.endsWith(join("lib", "crypto.ts")))
                .filter((file) => /\bdecrypt\(/.test(readFileSync(file, "utf-8")))
                .map((file) => relative(SRC, file));
            expect(decryptCallers).toEqual([]);
        });

        describe("with ENCRYPTION_KEY unset", () => {
            beforeEach(() => {
                delete process.env.ENCRYPTION_KEY;
                process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
            });

            afterEach(() => {
                delete process.env.ALLOW_PLAINTEXT_STORAGE;
            });

            it("still throws when ALLOW_PLAINTEXT_STORAGE is not set", async () => {
                delete process.env.ALLOW_PLAINTEXT_STORAGE;
                const stored = "enc:v1:aabbcc:ddeeff00112233445566778899aabbccddeeff";
                expect(() => encrypt("sk-x")).toThrow("ENCRYPTION_KEY must be set");
                expect(() => decrypt(stored)).toThrow("ENCRYPTION_KEY must be set");
                await expect(readEncrypted(stored, { field: "AiSettings.apiKey" })).rejects.toThrow("ENCRYPTION_KEY must be set");
                expect(isUndecryptable(stored, "AiSettings.apiKey")).toBe(false);
            });

            it("still passes values through when ALLOW_PLAINTEXT_STORAGE=true", async () => {
                process.env.ALLOW_PLAINTEXT_STORAGE = "true";
                const stored = encryptUnder(KEY_A, "sk-x");
                delete process.env.ENCRYPTION_KEY;
                process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

                expect(encrypt("sk-plain")).toBe("sk-plain");
                expect(decrypt(stored)).toBe(stored);
                await expect(readEncrypted(stored, { field: "AiSettings.apiKey" })).resolves.toBe(stored);
            });
        });
    });
});
