import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";
import { logger } from "@/lib/logger";

interface GoogleModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods: string[];
}

interface GoogleModelsResponse {
  models: GoogleModel[];
}

// GET /api/ai-settings/models — list available Gemini models using the user's API key
export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    const aiConfig = await getAiConfig(userId);

    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "No API key configured. Set one in AI Settings first." },
        { status: 400 }
      );
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${aiConfig.apiKey}&pageSize=200`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      logger.error("Google models API error", { status: res.status, body });
      return NextResponse.json(
        { error: `Google API returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as GoogleModelsResponse;

    const EXCLUDE_PATTERNS = ["tts", "image", "robotics", "computer-use", "deep-research", "nano-", "lyria"];

    const models = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .filter((m) => {
        const id = m.name.replace("models/", "").toLowerCase();
        return !EXCLUDE_PATTERNS.some((p) => id.includes(p));
      })
      .map((m) => ({
        id: m.name.replace("models/", ""),
        displayName: m.displayName,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
  } catch (error) {
    logger.error("GET /api/ai-settings/models error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
