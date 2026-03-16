import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getEnvDefaults(): AiProviderConfig {
  // Support new generic env vars, fall back to legacy REQUESTY_ vars
  const apiKey = env.AI_API_KEY || env.REQUESTY_API_KEY || "";
  const model = env.AI_MODEL || env.REQUESTY_MODEL || "google/gemini-2.0-flash-001";
  const baseUrl = env.AI_API_BASE_URL || (env.REQUESTY_API_KEY ? "https://router.requesty.ai/v1" : "");
  return { baseUrl, apiKey, model };
}

/**
 * Get AI provider configuration.
 * Priority: User DB settings > Global DB settings > env vars > hardcoded defaults.
 * API keys stored in DB are decrypted transparently.
 */
export async function getAiConfig(userId?: string | null): Promise<AiProviderConfig> {
  const envDefaults = getEnvDefaults();

  // Try per-user settings first
  if (userId) {
    try {
      const userSettings = await prisma.userAiSettings.findUnique({ where: { userId } });
      if (userSettings) {
        const decryptedKey = decrypt(userSettings.apiKey);
        // If user has a key set, use their full config (with fallbacks for empty fields)
        if (decryptedKey) {
          return {
            baseUrl: userSettings.baseUrl || envDefaults.baseUrl,
            apiKey: decryptedKey,
            model: userSettings.model || envDefaults.model,
          };
        }
      }
    } catch {
      // Table may not exist yet — fall through
    }
  }

  // Fall back to global ("default") settings
  try {
    const settings = await prisma.aiSettings.findUnique({ where: { id: "default" } });
    if (settings) {
      const decryptedKey = decrypt(settings.apiKey);
      return {
        baseUrl: settings.baseUrl || envDefaults.baseUrl,
        apiKey: decryptedKey || envDefaults.apiKey,
        model: settings.model || envDefaults.model,
      };
    }
  } catch {
    // Table may not exist yet — fall through to env defaults
  }
  return envDefaults;
}
