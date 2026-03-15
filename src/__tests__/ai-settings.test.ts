import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("@/lib/db", () => ({
    prisma: {
        aiSettings: {
            findUnique: vi.fn(),
        },
    },
}));

// Mock crypto
vi.mock("@/lib/crypto", () => ({
    decrypt: vi.fn((val: string) => val),
}));

import { getAiConfig } from "@/lib/ai/settings";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

describe("AI settings", () => {
    const origEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        origEnv.AI_API_KEY = process.env.AI_API_KEY;
        origEnv.AI_MODEL = process.env.AI_MODEL;
        origEnv.AI_API_BASE_URL = process.env.AI_API_BASE_URL;
        origEnv.REQUESTY_API_KEY = process.env.REQUESTY_API_KEY;
        origEnv.REQUESTY_MODEL = process.env.REQUESTY_MODEL;

        // Clear env
        delete process.env.AI_API_KEY;
        delete process.env.AI_MODEL;
        delete process.env.AI_API_BASE_URL;
        delete process.env.REQUESTY_API_KEY;
        delete process.env.REQUESTY_MODEL;

        vi.clearAllMocks();
    });

    afterEach(() => {
        for (const [key, val] of Object.entries(origEnv)) {
            if (val !== undefined) process.env[key] = val;
            else delete process.env[key];
        }
    });

    it("returns env defaults when no DB settings", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue(null);
        process.env.AI_API_KEY = "env-key";
        process.env.AI_MODEL = "env-model";
        process.env.AI_API_BASE_URL = "https://env.example.com";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("env-key");
        expect(config.model).toBe("env-model");
        expect(config.baseUrl).toBe("https://env.example.com");
    });

    it("uses DB settings over env when available", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue({
            id: "default",
            baseUrl: "https://db.example.com",
            apiKey: "db-key",
            model: "db-model",
        } as never);
        vi.mocked(decrypt).mockReturnValue("decrypted-db-key");

        process.env.AI_API_KEY = "env-key";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("decrypted-db-key");
        expect(config.model).toBe("db-model");
        expect(config.baseUrl).toBe("https://db.example.com");
    });

    it("falls back to env when DB fields are empty", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue({
            id: "default",
            baseUrl: "",
            apiKey: "",
            model: "",
        } as never);
        vi.mocked(decrypt).mockReturnValue("");

        process.env.AI_API_KEY = "env-key";
        process.env.AI_MODEL = "env-model";
        process.env.AI_API_BASE_URL = "https://env.example.com";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("env-key");
        expect(config.model).toBe("env-model");
        expect(config.baseUrl).toBe("https://env.example.com");
    });

    it("falls through to env defaults on DB error", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockRejectedValue(new Error("table not found"));
        process.env.AI_API_KEY = "fallback-key";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("fallback-key");
    });

    it("uses REQUESTY_ env vars as fallback", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue(null);
        process.env.REQUESTY_API_KEY = "requesty-key";
        process.env.REQUESTY_MODEL = "requesty-model";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("requesty-key");
        expect(config.model).toBe("requesty-model");
        expect(config.baseUrl).toBe("https://router.requesty.ai/v1");
    });

    it("returns hardcoded defaults when no env or DB", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue(null);

        const config = await getAiConfig();
        expect(config.apiKey).toBe("");
        expect(config.model).toBe("google/gemini-2.0-flash-001");
        expect(config.baseUrl).toBe("");
    });
});
