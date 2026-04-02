import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { encrypt, decrypt } from "@/lib/crypto";
import { getCurrentUserId } from "@/lib/api-auth";

// GET /api/ai-settings — return current AI settings (user-level if authenticated, else global)
export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    // Try user-level settings first
    if (userId) {
      try {
        const userSettings = await prisma.userAiSettings.findUnique({ where: { userId } });
        if (userSettings) {
          const decryptedKey = decrypt(userSettings.apiKey);
          return NextResponse.json({
            baseUrl: userSettings.baseUrl,
            apiKey: decryptedKey ? maskKey(decryptedKey) : "",
            model: userSettings.model,
            hasApiKey: !!decryptedKey,
            scope: "user",
            customInstructions: userSettings.customInstructions,
            coachingStyle: userSettings.coachingStyle,
            responseLength: userSettings.responseLength,
          });
        }
      } catch {
        // Table may not exist yet — fall through
      }
    }

    // Fall back to global settings
    const settings = await prisma.aiSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      return NextResponse.json({ baseUrl: "", apiKey: "", model: "", scope: "global" });
    }
    const decryptedKey = decrypt(settings.apiKey);
    return NextResponse.json({
      baseUrl: settings.baseUrl,
      apiKey: decryptedKey ? maskKey(decryptedKey) : "",
      model: settings.model,
      hasApiKey: !!decryptedKey,
      scope: "global",
    });
  } catch {
    // Table may not exist yet
    return NextResponse.json({ baseUrl: "", apiKey: "", model: "", scope: "global" });
  }
}

// PUT /api/ai-settings — update AI settings (user-level if authenticated, else global)
export async function PUT(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    const body = await request.json();
    const { baseUrl, apiKey, model, customInstructions, coachingStyle, responseLength } = body as {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      customInstructions?: string;
      coachingStyle?: string;
      responseLength?: string;
    };

    // Build update data — only include fields that were actually sent
    const data: Record<string, string> = {};
    if (baseUrl !== undefined) data.baseUrl = baseUrl.trim();
    if (apiKey !== undefined) data.apiKey = encrypt(apiKey.trim());
    if (model !== undefined) data.model = model.trim();
    if (customInstructions !== undefined) data.customInstructions = customInstructions;
    if (coachingStyle !== undefined) data.coachingStyle = coachingStyle;
    if (responseLength !== undefined) data.responseLength = responseLength;

    // Save to user-level settings if authenticated
    if (userId) {
      try {
        const settings = await prisma.userAiSettings.upsert({
          where: { userId },
          update: data,
          create: {
            userId,
            baseUrl: data.baseUrl ?? "",
            apiKey: data.apiKey ?? "",
            model: data.model ?? "",
          },
        });

        const decryptedKey = decrypt(settings.apiKey);
        return NextResponse.json({
          baseUrl: settings.baseUrl,
          apiKey: decryptedKey ? maskKey(decryptedKey) : "",
          model: settings.model,
          hasApiKey: !!decryptedKey,
          scope: "user",
          customInstructions: settings.customInstructions,
          coachingStyle: settings.coachingStyle,
          responseLength: settings.responseLength,
        });
      } catch (userSettingsError) {
        // Table may not exist yet — fall through to global settings
        logger.error("PUT /api/ai-settings: userAiSettings upsert failed, falling back to global", userSettingsError);
      }
    }

    // Fall back to global settings for unauthenticated/dev mode
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

    const decryptedKey = decrypt(settings.apiKey);
    return NextResponse.json({
      baseUrl: settings.baseUrl,
      apiKey: decryptedKey ? maskKey(decryptedKey) : "",
      model: settings.model,
      hasApiKey: !!decryptedKey,
      scope: "global",
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
