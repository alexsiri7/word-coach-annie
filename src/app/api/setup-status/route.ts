import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readGlobalApiKey, readUserApiKey } from "@/lib/ai/settings";
import { getCurrentUserId } from "@/lib/api-auth";

// GET /api/setup-status — check if initial setup (API key) is complete
export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    // Check user-level settings first
    if (userId) {
      try {
        const userSettings = await prisma.userAiSettings.findUnique({ where: { userId } });
        if (userSettings) {
          const decryptedKey = await readUserApiKey(userSettings);
          if (decryptedKey) {
            return NextResponse.json({ setupComplete: true, hasApiKey: true });
          }
        }
      } catch {
        // Table may not exist yet — fall through
      }
    }

    // Check global settings
    const settings = await prisma.aiSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      return NextResponse.json({ setupComplete: false, hasApiKey: false });
    }
    const decryptedKey = await readGlobalApiKey(settings);
    const hasApiKey = !!decryptedKey;
    return NextResponse.json({ setupComplete: hasApiKey, hasApiKey });
  } catch {
    return NextResponse.json({ setupComplete: false, hasApiKey: false });
  }
}
