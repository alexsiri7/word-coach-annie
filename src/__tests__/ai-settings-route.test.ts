import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    aiSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    userAiSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// Mock crypto
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((val: string) => `enc:${val}`),
  readEncrypted: vi.fn(async (val: string) => val.replace(/^enc:/, "")),
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
    warn: vi.fn(),
  },
}));

import { GET, PUT } from "@/app/api/ai-settings/route";
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

const SHARED_KEY = "AIzaSharedSecret1234";

function makeGetRequest(userId?: string): NextRequest {
  vi.mocked(getCurrentUserId).mockReturnValue(userId ?? null);
  return new NextRequest("http://localhost:3000/api/ai-settings");
}

function expectNoSharedKeyChars(apiKey: string) {
  expect(apiKey).toBe("****");
  expect(apiKey).not.toContain(SHARED_KEY.slice(0, 4));
  expect(apiKey).not.toContain(SHARED_KEY.slice(-4));
}

describe("GET /api/ai-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.aiSettings.findUnique).mockResolvedValue({
      id: "default",
      apiKey: `enc:${SHARED_KEY}`,
      model: "global-model",
    } as never);
  });

  it.each([
    ["an unauthenticated caller", undefined],
    ["a user without their own settings", "user-123"],
  ])("reveals no characters of the shared key to %s", async (_label, userId) => {
    vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue(null);

    const data = await (await GET(makeGetRequest(userId))).json();

    expect(data.scope).toBe("global");
    expect(data.hasApiKey).toBe(true);
    expectNoSharedKeyChars(data.apiKey);
  });

  it("still masks a user's own key with its first and last 4 characters", async () => {
    vi.mocked(prisma.userAiSettings.findUnique).mockResolvedValue({
      id: "u1",
      userId: "user-123",
      apiKey: "enc:AIzaUserOwnKey9876",
      model: "user-model",
    } as never);

    const data = await (await GET(makeGetRequest("user-123"))).json();

    expect(data.scope).toBe("user");
    expect(data.apiKey).toBe("AIza...9876");
  });
});

describe("PUT /api/ai-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 (does not fall through to global) when userAiSettings upsert fails for an authenticated user", async () => {
    // HIGH-04: a per-user upsert failure must not silently write to the
    // shared global row — that would let one user's failure poison settings
    // for everyone. Verify we surface the error and skip the global write.
    vi.mocked(prisma.userAiSettings.upsert).mockRejectedValue(
      new Error("table 'UserAiSettings' doesn't exist")
    );

    const req = makePutRequest({ model: "gpt-4" }, "user-123");
    const res = await PUT(req);

    expect(res.status).toBe(500);
    expect(prisma.aiSettings.upsert).not.toHaveBeenCalled();
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

  it("saves compression settings when provided", async () => {
    vi.mocked(prisma.userAiSettings.upsert).mockResolvedValue({
      userId: "user-123",
      baseUrl: "",
      apiKey: "enc:key",
      model: "user-model",
      customInstructions: "",
      coachingStyle: "balanced",
      responseLength: "moderate",
      chatWindowSize: 3,
      messagesUntilCompression: 10,
      compressionModel: "gemini-flash",
    } as never);

    const req = makePutRequest(
      { chatWindowSize: 3, messagesUntilCompression: 10, compressionModel: "gemini-flash" },
      "user-123"
    );
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.chatWindowSize).toBe(3);
    expect(data.messagesUntilCompression).toBe(10);
    expect(data.compressionModel).toBe("gemini-flash");
    expect(data.scope).toBe("user");

    const upsertCall = vi.mocked(prisma.userAiSettings.upsert).mock.calls[0][0];
    expect(upsertCall.update).toMatchObject({
      chatWindowSize: 3,
      messagesUntilCompression: 10,
      compressionModel: "gemini-flash",
    });
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

  it("reveals no characters of the shared key after saving it", async () => {
    vi.mocked(prisma.aiSettings.upsert).mockResolvedValue({
      id: "default",
      apiKey: `enc:${SHARED_KEY}`,
      model: "",
    } as never);

    const data = await (await PUT(makePutRequest({ apiKey: SHARED_KEY }))).json();

    expect(data.scope).toBe("global");
    expect(data.hasApiKey).toBe(true);
    expectNoSharedKeyChars(data.apiKey);
  });

  it.each([
    ["chatWindowSize above the cap", { chatWindowSize: 100000 }],
    ["chatWindowSize below the floor", { chatWindowSize: 0 }],
    ["non-integer chatWindowSize", { chatWindowSize: 5.5 }],
    ["string chatWindowSize", { chatWindowSize: "5" }],
    ["messagesUntilCompression above the cap", { messagesUntilCompression: 100000 }],
    ["negative messagesUntilCompression", { messagesUntilCompression: -1 }],
    ["unknown coachingStyle", { coachingStyle: "brutal" }],
    ["unknown responseLength", { responseLength: "endless" }],
    ["oversized model", { model: "m".repeat(201) }],
    ["oversized compressionModel", { compressionModel: "m".repeat(201) }],
    ["oversized customInstructions", { customInstructions: "m".repeat(5001) }],
    ["non-string apiKey", { apiKey: 123 }],
  ])("rejects %s with 400 and writes nothing", async (_label, body) => {
    for (const userId of ["user-123", undefined]) {
      const res = await PUT(makePutRequest(body, userId));
      expect(res.status).toBe(400);
    }
    expect(prisma.userAiSettings.upsert).not.toHaveBeenCalled();
    expect(prisma.aiSettings.upsert).not.toHaveBeenCalled();
  });

  it("accepts the boundary values the settings page allows", async () => {
    vi.mocked(prisma.userAiSettings.upsert).mockResolvedValue({
      userId: "user-123",
      apiKey: "",
      model: "",
    } as never);

    for (const body of [
      { chatWindowSize: 3, messagesUntilCompression: 5, coachingStyle: "gentle", responseLength: "concise" },
      { chatWindowSize: 20, messagesUntilCompression: 50, coachingStyle: "direct", responseLength: "detailed" },
    ]) {
      const res = await PUT(makePutRequest(body, "user-123"));
      expect(res.status).toBe(200);
    }
    expect(prisma.userAiSettings.upsert).toHaveBeenCalledTimes(2);
  });
});
