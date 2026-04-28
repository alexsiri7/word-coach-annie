import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface AiProviderConfig {
  apiKey: string;
  model: string;
}

export type CoachingStyle = "gentle" | "balanced" | "direct";
export type ResponseLength = "concise" | "moderate" | "detailed";

export interface AiPreferences {
  customInstructions: string;
  coachingStyle: CoachingStyle;
  responseLength: ResponseLength;
}

export interface ChatCompressionSettings {
  chatWindowSize: number;
  messagesUntilCompression: number;
  compressionModel: string;
}

const DEFAULT_COMPRESSION: ChatCompressionSettings = {
  chatWindowSize: 5,
  messagesUntilCompression: 15,
  compressionModel: "",
};

const DEFAULT_PREFERENCES: AiPreferences = {
  customInstructions: "",
  coachingStyle: "balanced",
  responseLength: "moderate",
};

function getEnvDefaults(): AiProviderConfig {
  const apiKey = env.GEMINI_API_KEY || env.AI_API_KEY || env.REQUESTY_API_KEY || "";
  const model = env.AI_MODEL || env.REQUESTY_MODEL || "gemini-2.0-flash-001";
  return { apiKey, model };
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
            apiKey: decryptedKey,
            model: userSettings.model || envDefaults.model,
          };
        }
      }
    } catch (err) {
      logger.warn("Failed to load user AI settings, falling back", err);
    }
  }

  // Fall back to global ("default") settings
  try {
    const settings = await prisma.aiSettings.findUnique({ where: { id: "default" } });
    if (settings) {
      const decryptedKey = decrypt(settings.apiKey);
      return {
        apiKey: decryptedKey || envDefaults.apiKey,
        model: settings.model || envDefaults.model,
      };
    }
  } catch (err) {
    logger.warn("Failed to load global AI settings, falling back to env", err);
  }
  return envDefaults;
}

/**
 * Get per-user AI behavior preferences.
 * Returns defaults if no user settings exist.
 */
export async function getAiPreferences(userId?: string | null): Promise<AiPreferences> {
  if (!userId) return DEFAULT_PREFERENCES;

  try {
    const userSettings = await prisma.userAiSettings.findUnique({ where: { userId } });
    if (userSettings) {
      return {
        customInstructions: userSettings.customInstructions,
        coachingStyle: (userSettings.coachingStyle as CoachingStyle) || "balanced",
        responseLength: (userSettings.responseLength as ResponseLength) || "moderate",
      };
    }
  } catch (err) {
    logger.warn("Failed to load user AI preferences, using defaults", err);
  }
  return DEFAULT_PREFERENCES;
}

export async function getCompressionSettings(
  userId?: string | null
): Promise<ChatCompressionSettings> {
  if (!userId) return DEFAULT_COMPRESSION;
  try {
    const userSettings = await prisma.userAiSettings.findUnique({ where: { userId } });
    if (userSettings) {
      return {
        chatWindowSize: userSettings.chatWindowSize,
        messagesUntilCompression: userSettings.messagesUntilCompression,
        compressionModel: userSettings.compressionModel || "",
      };
    }
  } catch (err) {
    logger.warn("Failed to load compression settings, using defaults", err);
  }
  return DEFAULT_COMPRESSION;
}

const COACHING_STYLE_INSTRUCTIONS: Record<CoachingStyle, string> = {
  gentle: "Be encouraging and supportive. Frame suggestions positively. Focus on what works well before mentioning areas for improvement.",
  balanced: "Be encouraging but honest — like a good writing partner. Balance praise with constructive feedback.",
  direct: "Be direct and candid. Prioritize actionable feedback over encouragement. Point out weaknesses clearly and suggest specific fixes.",
};

const RESPONSE_LENGTH_INSTRUCTIONS: Record<ResponseLength, string> = {
  concise: "Keep responses brief and to the point. Use short paragraphs. Aim for 2-4 sentences unless the user asks for more detail.",
  moderate: "Keep responses concise unless asked to elaborate.",
  detailed: "Provide thorough, detailed responses. Explain your reasoning. Include examples and alternatives where helpful.",
};

/**
 * Build system prompt additions from user AI preferences.
 */
export function buildPreferenceInstructions(prefs: AiPreferences): string {
  const parts: string[] = [];

  parts.push(COACHING_STYLE_INSTRUCTIONS[prefs.coachingStyle]);
  parts.push(RESPONSE_LENGTH_INSTRUCTIONS[prefs.responseLength]);

  if (prefs.customInstructions.trim()) {
    parts.push(`Additional user instructions: ${prefs.customInstructions.trim()}`);
  }

  return parts.join("\n");
}
