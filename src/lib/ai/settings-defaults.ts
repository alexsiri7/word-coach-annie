// Client-safe: imported by the settings page as well as the server, so it must not import server-only modules.

export const COACHING_STYLES = ["gentle", "balanced", "direct"] as const;
export const RESPONSE_LENGTHS = ["concise", "moderate", "detailed"] as const;
export type CoachingStyle = (typeof COACHING_STYLES)[number];
export type ResponseLength = (typeof RESPONSE_LENGTHS)[number];

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

export const DEFAULT_COMPRESSION: ChatCompressionSettings = {
  chatWindowSize: 5,
  messagesUntilCompression: 15,
  compressionModel: "",
};

export const DEFAULT_PREFERENCES: AiPreferences = {
  customInstructions: "",
  coachingStyle: "balanced",
  responseLength: "moderate",
};
