import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("@/lib/db", () => ({
    prisma: {
        aiSettings: {
            findUnique: vi.fn(),
        },
        userAiSettings: {
            findUnique: vi.fn(),
        },
    },
}));

// Mock crypto
vi.mock("@/lib/crypto", () => ({
    decrypt: vi.fn((val: string) => val),
}));

import { getAiConfig, getAiPreferences, buildPreferenceInstructions } from "@/lib/ai/settings";
import type { AiPreferences } from "@/lib/ai/settings";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

describe("AI settings", () => {
    const origEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        origEnv.AI_API_KEY = process.env.AI_API_KEY;
        origEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        origEnv.AI_MODEL = process.env.AI_MODEL;
        origEnv.REQUESTY_API_KEY = process.env.REQUESTY_API_KEY;
        origEnv.REQUESTY_MODEL = process.env.REQUESTY_MODEL;

        // Clear env
        delete process.env.AI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        delete process.env.AI_MODEL;
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
        process.env.GEMINI_API_KEY = "env-key";
        process.env.AI_MODEL = "env-model";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("env-key");
        expect(config.model).toBe("env-model");
    });

    it("uses DB settings over env when available", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue({
            id: "default",
            baseUrl: "",
            apiKey: "db-key",
            model: "db-model",
        } as never);
        vi.mocked(decrypt).mockReturnValue("decrypted-db-key");

        process.env.AI_API_KEY = "env-key";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("decrypted-db-key");
        expect(config.model).toBe("db-model");
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

        const config = await getAiConfig();
        expect(config.apiKey).toBe("env-key");
        expect(config.model).toBe("env-model");
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
    });

    it("returns hardcoded defaults when no env or DB", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue(null);

        const config = await getAiConfig();
        expect(config.apiKey).toBe("");
        expect(config.model).toBe("gemini-2.0-flash-001");
    });

    it("prefers GEMINI_API_KEY over AI_API_KEY", async () => {
        vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue(null);
        process.env.GEMINI_API_KEY = "gemini-key";
        process.env.AI_API_KEY = "ai-key";

        const config = await getAiConfig();
        expect(config.apiKey).toBe("gemini-key");
    });

    describe("per-user settings", () => {
        it("uses user settings when userId is provided and user has a key", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue({
                id: "user-settings-1",
                userId: "user-1",
                baseUrl: "",
                apiKey: "user-encrypted-key",
                model: "user-model",
            } as never);
            vi.mocked(decrypt).mockReturnValue("user-decrypted-key");

            process.env.AI_API_KEY = "env-key";

            const config = await getAiConfig("user-1");
            expect(config.apiKey).toBe("user-decrypted-key");
            expect(config.model).toBe("user-model");
            expect(prisma.userAiSettings.findUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
        });

        it("falls back to global settings when user has no settings", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue({
                id: "default",
                baseUrl: "",
                apiKey: "global-key",
                model: "global-model",
            } as never);
            vi.mocked(decrypt).mockReturnValue("global-decrypted-key");

            const config = await getAiConfig("user-1");
            expect(config.apiKey).toBe("global-decrypted-key");
            expect(config.model).toBe("global-model");
        });

        it("falls back to global when user key is empty", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue({
                id: "user-settings-1",
                userId: "user-1",
                baseUrl: "",
                apiKey: "",
                model: "user-model",
            } as never);
            vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue({
                id: "default",
                baseUrl: "",
                apiKey: "global-key",
                model: "global-model",
            } as never);
            vi.mocked(decrypt)
                .mockReturnValueOnce("")
                .mockReturnValueOnce("global-decrypted-key");

            const config = await getAiConfig("user-1");
            expect(config.apiKey).toBe("global-decrypted-key");
            expect(config.model).toBe("global-model");
        });

        it("uses env model when user model is empty", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue({
                id: "user-settings-1",
                userId: "user-1",
                baseUrl: "",
                apiKey: "user-key",
                model: "",
            } as never);
            vi.mocked(decrypt).mockReturnValue("user-decrypted-key");

            process.env.AI_MODEL = "env-model";

            const config = await getAiConfig("user-1");
            expect(config.apiKey).toBe("user-decrypted-key");
            expect(config.model).toBe("env-model");
        });

        it("skips user lookup when no userId provided", async () => {
            vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue(null);
            process.env.AI_API_KEY = "env-key";

            const config = await getAiConfig();
            expect(config.apiKey).toBe("env-key");
            expect(prisma.userAiSettings.findUnique).not.toHaveBeenCalled();
        });

        it("falls through on user DB error", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockRejectedValue(new Error("table not found"));
            vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue(null);
            process.env.AI_API_KEY = "env-key";

            const config = await getAiConfig("user-1");
            expect(config.apiKey).toBe("env-key");
        });
    });

    describe("getAiPreferences", () => {
        it("returns defaults when no userId", async () => {
            const prefs = await getAiPreferences();
            expect(prefs.customInstructions).toBe("");
            expect(prefs.coachingStyle).toBe("balanced");
            expect(prefs.responseLength).toBe("moderate");
        });

        it("returns defaults when user has no settings", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue(null);
            const prefs = await getAiPreferences("user-1");
            expect(prefs.coachingStyle).toBe("balanced");
        });

        it("returns user preferences when set", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue({
                id: "settings-1",
                userId: "user-1",
                baseUrl: "",
                apiKey: "",
                model: "",
                customInstructions: "Focus on dialogue",
                coachingStyle: "direct",
                responseLength: "concise",
            } as never);

            const prefs = await getAiPreferences("user-1");
            expect(prefs.customInstructions).toBe("Focus on dialogue");
            expect(prefs.coachingStyle).toBe("direct");
            expect(prefs.responseLength).toBe("concise");
        });

        it("falls through on DB error", async () => {
            vi.mocked(prisma.userAiSettings.findUnique).mockRejectedValue(new Error("table error"));
            const prefs = await getAiPreferences("user-1");
            expect(prefs.coachingStyle).toBe("balanced");
        });
    });

    describe("buildPreferenceInstructions", () => {
        it("includes coaching style instructions", () => {
            const prefs: AiPreferences = {
                customInstructions: "",
                coachingStyle: "gentle",
                responseLength: "moderate",
            };
            const result = buildPreferenceInstructions(prefs);
            expect(result).toContain("encouraging and supportive");
        });

        it("includes response length instructions", () => {
            const prefs: AiPreferences = {
                customInstructions: "",
                coachingStyle: "balanced",
                responseLength: "detailed",
            };
            const result = buildPreferenceInstructions(prefs);
            expect(result).toContain("thorough, detailed");
        });

        it("includes custom instructions when provided", () => {
            const prefs: AiPreferences = {
                customInstructions: "Focus on dialogue quality",
                coachingStyle: "balanced",
                responseLength: "moderate",
            };
            const result = buildPreferenceInstructions(prefs);
            expect(result).toContain("Focus on dialogue quality");
        });

        it("omits custom instructions when empty", () => {
            const prefs: AiPreferences = {
                customInstructions: "   ",
                coachingStyle: "balanced",
                responseLength: "moderate",
            };
            const result = buildPreferenceInstructions(prefs);
            expect(result).not.toContain("Additional user instructions");
        });
    });
});
