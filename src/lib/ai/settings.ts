import { prisma } from "@/lib/db";

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getEnvDefaults(): AiProviderConfig {
  // Support new generic env vars, fall back to legacy REQUESTY_ vars
  const apiKey = process.env.AI_API_KEY || process.env.REQUESTY_API_KEY || "";
  const model = process.env.AI_MODEL || process.env.REQUESTY_MODEL || "google/gemini-2.0-flash-001";
  const baseUrl = process.env.AI_API_BASE_URL || (process.env.REQUESTY_API_KEY ? "https://router.requesty.ai/v1" : "");
  return { baseUrl, apiKey, model };
}

/**
 * Get AI provider configuration.
 * Priority: DB settings (non-empty fields) > env vars > hardcoded defaults.
 */
export async function getAiConfig(): Promise<AiProviderConfig> {
  const envDefaults = getEnvDefaults();
  try {
    const settings = await prisma.aiSettings.findUnique({ where: { id: "default" } });
    if (settings) {
      return {
        baseUrl: settings.baseUrl || envDefaults.baseUrl,
        apiKey: settings.apiKey || envDefaults.apiKey,
        model: settings.model || envDefaults.model,
      };
    }
  } catch {
    // Table may not exist yet — fall through to env defaults
  }
  return envDefaults;
}
