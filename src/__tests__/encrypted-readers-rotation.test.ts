import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HashnodeAuthController, readHashnodeToken } from "@/lib/controllers/hashnode-auth";
import { readGlobalApiKey, readUserApiKey } from "@/lib/ai/settings";
import { decrypt, encrypt } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { testPrisma } from "./setup";

// The rewrite-on-read and compare-and-swap behaviour of each stored-secret
// reader, against the real tables (GoogleCredential's is covered in
// google-auth-controller.test.ts).

const KEY_A = "readers-rotation-key-a";
const KEY_B = "readers-rotation-key-b";

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

function rotateToB() {
    process.env.ENCRYPTION_KEY = KEY_B;
    process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
}

type Row = { id: string; apiKey: string } | { id: string; accessToken: string };

const readers = [
    {
        name: "HashnodeCredential.accessToken",
        async create(value: string) {
            return testPrisma.hashnodeCredential.create({
                data: { userId: "local", accessToken: value, publicationId: "p", username: "u" },
            });
        },
        read: (row: Row) => readHashnodeToken(row as { id: string; accessToken: string }),
        async stored(row: Row) {
            return (await testPrisma.hashnodeCredential.findUniqueOrThrow({ where: { id: row.id } })).accessToken;
        },
        async overwrite(row: Row, value: string) {
            await testPrisma.hashnodeCredential.update({ where: { id: row.id }, data: { accessToken: value } });
        },
        missing: null,
    },
    {
        name: "UserAiSettings.apiKey",
        async create(value: string) {
            const user = await testPrisma.user.create({ data: { email: "r@example.com", googleId: "g-readers" } });
            return testPrisma.userAiSettings.create({ data: { userId: user.id, apiKey: value } });
        },
        read: (row: Row) => readUserApiKey(row as { id: string; apiKey: string }),
        async stored(row: Row) {
            return (await testPrisma.userAiSettings.findUniqueOrThrow({ where: { id: row.id } })).apiKey;
        },
        async overwrite(row: Row, value: string) {
            await testPrisma.userAiSettings.update({ where: { id: row.id }, data: { apiKey: value } });
        },
        missing: "",
    },
    {
        name: "AiSettings.apiKey",
        async create(value: string) {
            return testPrisma.aiSettings.create({ data: { id: "default", apiKey: value } });
        },
        read: (row: Row) => readGlobalApiKey(row as { id: string; apiKey: string }),
        async stored(row: Row) {
            return (await testPrisma.aiSettings.findUniqueOrThrow({ where: { id: row.id } })).apiKey;
        },
        async overwrite(row: Row, value: string) {
            await testPrisma.aiSettings.update({ where: { id: row.id }, data: { apiKey: value } });
        },
        missing: "",
    },
];

describe("stored-secret readers under ENCRYPTION_KEY rotation", () => {
    let origEncKey: string | undefined;
    let origPrevious: string | undefined;

    beforeEach(() => {
        origEncKey = process.env.ENCRYPTION_KEY;
        origPrevious = process.env.ENCRYPTION_KEY_PREVIOUS;
    });

    afterEach(() => {
        if (origEncKey !== undefined) process.env.ENCRYPTION_KEY = origEncKey;
        else delete process.env.ENCRYPTION_KEY;
        if (origPrevious !== undefined) process.env.ENCRYPTION_KEY_PREVIOUS = origPrevious;
        else delete process.env.ENCRYPTION_KEY_PREVIOUS;
    });

    describe.each(readers)("$name", (reader) => {
        it("reads a previous-key value and rewrites its row under the current key", async () => {
            const row = await reader.create(encryptUnder(KEY_A, "secret-under-a"));
            rotateToB();

            await expect(reader.read(row)).resolves.toBe("secret-under-a");
            expect(decryptUnderOnly(KEY_B, await reader.stored(row))).toBe("secret-under-a");
        });

        it("leaves a value replaced between the read and the rewrite alone", async () => {
            const row = await reader.create(encryptUnder(KEY_A, "secret-stale"));
            const replaced = encryptUnder(KEY_A, "secret-saved-meanwhile");
            await reader.overwrite(row, replaced);
            rotateToB();

            // `row` still holds the value read before the concurrent write.
            await expect(reader.read(row)).resolves.toBe("secret-stale");
            expect(await reader.stored(row)).toBe(replaced);
        });

        it("reads a value no configured key decrypts as missing, leaving the row in place", async () => {
            const lost = encryptUnder(KEY_A, "secret-lost");
            const row = await reader.create(lost);
            process.env.ENCRYPTION_KEY = KEY_B;
            const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

            await expect(reader.read(row)).resolves.toBe(reader.missing);
            expect(await reader.stored(row)).toBe(lost);
            warn.mockRestore();
        });
    });
});

describe("HashnodeAuthController.getStatus", () => {
    let origEncKey: string | undefined;

    beforeEach(async () => {
        origEncKey = process.env.ENCRYPTION_KEY;
        await testPrisma.hashnodeCredential.create({
            data: { userId: "local", accessToken: encryptUnder(KEY_A, "token"), publicationId: "p", username: "u" },
        });
    });

    afterEach(() => {
        if (origEncKey !== undefined) process.env.ENCRYPTION_KEY = origEncKey;
        else delete process.env.ENCRYPTION_KEY;
        process.env.ALLOW_PLAINTEXT_STORAGE = "true";
    });

    it("reports a token no configured key decrypts as disconnected", async () => {
        process.env.ENCRYPTION_KEY = KEY_B;
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        await expect(HashnodeAuthController.getStatus(null)).resolves.toEqual({ connected: false });
        warn.mockRestore();
    });

    it("still reports connected when ENCRYPTION_KEY is unset", async () => {
        delete process.env.ENCRYPTION_KEY;
        delete process.env.ALLOW_PLAINTEXT_STORAGE;
        await expect(HashnodeAuthController.getStatus(null)).resolves.toEqual({
            connected: true,
            username: "u",
            publicationId: "p",
        });
    });
});
