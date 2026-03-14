import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// GET /api/ai-settings — return current AI settings (without exposing the full API key)
export async function GET() {
  try {
    const settings = await prisma.aiSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      return NextResponse.json({ baseUrl: "", apiKey: "", model: "" });
    }
    return NextResponse.json({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey ? maskKey(settings.apiKey) : "",
      model: settings.model,
      hasApiKey: !!settings.apiKey,
    });
  } catch {
    // Table may not exist yet
    return NextResponse.json({ baseUrl: "", apiKey: "", model: "" });
  }
}

// PUT /api/ai-settings — update AI settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { baseUrl, apiKey, model } = body as {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    };

    // Build update data — only include fields that were actually sent
    const data: Record<string, string> = {};
    if (baseUrl !== undefined) data.baseUrl = baseUrl.trim();
    if (apiKey !== undefined) data.apiKey = apiKey.trim();
    if (model !== undefined) data.model = model.trim();

    const settings = await prisma.aiSettings.upsert({
      where: { id: "default" },
      update: data,
      create: {
        id: "default",
        baseUrl: data.baseUrl ?? "",
        apiKey: data.apiKey ?? "",
        model: data.model ?? "",
      },
    });

    return NextResponse.json({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey ? maskKey(settings.apiKey) : "",
      model: settings.model,
      hasApiKey: !!settings.apiKey,
    });
  } catch (error) {
    logger.error("PUT /api/ai-settings error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Mask an API key for display: show first 4 and last 4 chars */
function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
