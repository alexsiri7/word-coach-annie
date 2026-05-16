import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(),
}));
vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { GET } from "@/app/api/ai-settings/models/route";
import { getCurrentUserId } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";

const API_KEY = "test-api-key-12345";

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai-settings/models");
}

describe("GET /api/ai-settings/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue("user-123");
    vi.mocked(getAiConfig).mockResolvedValue({ apiKey: API_KEY } as never);
  });

  it("passes API key via x-goog-api-key header, not URL query param", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), { status: 200 })
    );

    await GET(makeGetRequest());

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];

    // Key must NOT be in the URL
    expect(String(calledUrl)).not.toContain("key=");
    expect(String(calledUrl)).not.toContain(API_KEY);

    // Key MUST be in the header
    expect((calledInit as RequestInit).headers).toMatchObject({
      "x-goog-api-key": API_KEY,
    });
  });

  it("returns 400 when no API key is configured", async () => {
    vi.mocked(getAiConfig).mockResolvedValue({ apiKey: null } as never);

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no api key/i);
  });

  it("returns Google API error status when upstream fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
  });

  it("filters out non-generateContent models", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-pro",
              displayName: "Gemini Pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embedding-001",
              displayName: "Embedding",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
        { status: 200 }
      )
    );

    const res = await GET(makeGetRequest());
    const data = await res.json();

    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe("gemini-pro");
  });

  it("filters out excluded model patterns (tts, image, robotics, etc.)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-pro",
              displayName: "Gemini Pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-tts",
              displayName: "Gemini TTS",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-image-gen",
              displayName: "Gemini Image",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-nano-lite",
              displayName: "Gemini Nano Lite",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
        { status: 200 }
      )
    );

    const res = await GET(makeGetRequest());
    const data = await res.json();

    expect(data.models).toHaveLength(1);
    expect(data.models[0].id).toBe("gemini-pro");
  });

  it("returns models sorted alphabetically by id", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-pro",
              displayName: "Gemini Pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-flash",
              displayName: "Gemini Flash",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-advanced",
              displayName: "Gemini Advanced",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
        { status: 200 }
      )
    );

    const res = await GET(makeGetRequest());
    const data = await res.json();

    expect(data.models.map((m: { id: string }) => m.id)).toEqual([
      "gemini-advanced",
      "gemini-flash",
      "gemini-pro",
    ]);
  });

  it("returns 500 on unexpected errors", async () => {
    vi.mocked(getAiConfig).mockRejectedValue(new Error("DB connection failed"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/internal server error/i);
  });
});
