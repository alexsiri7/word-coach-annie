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
  decrypt: vi.fn((val: string) => val.replace("enc:", "")),
}));

// Mock auth
vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { PUT } from "@/app/api/ai-settings/route";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";

function makeRequest(body: Record<string, unknown>): NextRequest {
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

  it("saves to userAiSettings when authenticated", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.userAiSettings.upsert).mockResolvedValue({
      id: "1",
      userId: "user-1",
      baseUrl: "https://example.com",
      apiKey: "enc:my-key",
      model: "my-model",
    } as never);

    const res = await PUT(makeRequest({ baseUrl: "https://example.com", apiKey: "my-key", model: "my-model" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scope).toBe("user");
    expect(prisma.userAiSettings.upsert).toHaveBeenCalled();
  });

  it("falls through to global settings when userAiSettings.upsert throws", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.userAiSettings.upsert).mockRejectedValue(new Error("table not found"));
    vi.mocked(prisma.aiSettings.upsert).mockResolvedValue({
      id: "default",
      baseUrl: "https://global.com",
      apiKey: "enc:global-key",
      model: "global-model",
    } as never);

    const res = await PUT(makeRequest({ baseUrl: "https://global.com", apiKey: "global-key", model: "global-model" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scope).toBe("global");
    expect(prisma.aiSettings.upsert).toHaveBeenCalled();
  });

  it("saves to global settings when unauthenticated", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(prisma.aiSettings.upsert).mockResolvedValue({
      id: "default",
      baseUrl: "https://global.com",
      apiKey: "enc:global-key",
      model: "global-model",
    } as never);

    const res = await PUT(makeRequest({ baseUrl: "https://global.com", apiKey: "global-key", model: "global-model" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scope).toBe("global");
    expect(prisma.userAiSettings.upsert).not.toHaveBeenCalled();
  });
});
