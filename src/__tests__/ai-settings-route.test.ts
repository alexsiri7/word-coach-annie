import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    aiSettings: {
      upsert: vi.fn(),
    },
    userAiSettings: {
      upsert: vi.fn(),
    },
  },
}));

// Mock crypto
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((val: string) => `enc:${val}`),
  decrypt: vi.fn((val: string) => val.replace(/^enc:/, "")),
}));

// Mock api-auth
vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { PUT } from "@/app/api/ai-settings/route";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

function makePutRequest(body: Record<string, unknown>, userId?: string): NextRequest {
  vi.mocked(getCurrentUserId).mockReturnValue(userId ?? null);
  return new NextRequest("http://localhost:3000/api/ai-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/ai-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls through to global settings when userAiSettings table is missing", async () => {
    vi.mocked(prisma.userAiSettings.upsert).mockRejectedValue(
      new Error("table 'UserAiSettings' doesn't exist")
    );
    vi.mocked(prisma.aiSettings.upsert).mockResolvedValue({
      id: "default",
      baseUrl: "https://global.example.com",
      apiKey: "global-key",
      model: "global-model",
    } as never);

    const req = makePutRequest({ model: "gpt-4" }, "user-123");
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scope).toBe("global");
    expect(prisma.aiSettings.upsert).toHaveBeenCalled();
  });

  it("logs an error when userAiSettings upsert fails", async () => {
    const tableError = new Error("table 'UserAiSettings' doesn't exist");
    vi.mocked(prisma.userAiSettings.upsert).mockRejectedValue(tableError);
    vi.mocked(prisma.aiSettings.upsert).mockResolvedValue({
      id: "default",
      baseUrl: "",
      apiKey: "",
      model: "",
    } as never);

    const req = makePutRequest({ model: "gpt-4" }, "user-123");
    await PUT(req);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("userAiSettings upsert failed"),
      tableError
    );
  });

  it("saves to user settings when authenticated and table exists", async () => {
    vi.mocked(prisma.userAiSettings.upsert).mockResolvedValue({
      userId: "user-123",
      baseUrl: "https://user.example.com",
      apiKey: "enc:user-key",
      model: "user-model",
    } as never);

    const req = makePutRequest({ model: "user-model" }, "user-123");
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scope).toBe("user");
    expect(prisma.userAiSettings.upsert).toHaveBeenCalled();
    expect(prisma.aiSettings.upsert).not.toHaveBeenCalled();
  });

  it("saves to global settings when unauthenticated", async () => {
    vi.mocked(prisma.aiSettings.upsert).mockResolvedValue({
      id: "default",
      baseUrl: "",
      apiKey: "",
      model: "global-model",
    } as never);

    const req = makePutRequest({ model: "global-model" });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scope).toBe("global");
    expect(prisma.userAiSettings.upsert).not.toHaveBeenCalled();
  });
});
