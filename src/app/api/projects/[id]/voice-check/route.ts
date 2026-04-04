import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";
import { getVoiceContext } from "@/mcp/tools/coaching";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";

interface VoiceProfile {
  characterId: string;
  characterName: string;
  traits: string[];
  summary: string;
}

interface VoiceFeedback {
  characterId: string;
  characterName: string;
  issue: string;
  suggestedVoice: string;
  selectedText: string;
}

/**
 * POST /api/projects/[id]/voice-check
 *
 * Analyzes character voice consistency in a scene.
 * Uses shared context from MCP coaching module.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectWriteAccess(
    projectId,
    userId,
    request.headers.get("x-user-email"),
  );
  if (!access.authorized) return access.response;

  let sceneId: string | undefined;
  let selectedText: string | undefined;
  try {
    const body = await request.json();
    sceneId = body.sceneId;
    selectedText = body.selectedText;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!sceneId) {
    return NextResponse.json({ error: "sceneId is required" }, { status: 400 });
  }

  try {
    const ctx = await getVoiceContext(projectId, sceneId);

    if (ctx.characters.length === 0) {
      return NextResponse.json({ profiles: [], feedback: [] });
    }

    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      // Return basic profiles without AI feedback
      const profiles: VoiceProfile[] = ctx.characters.map((c) => ({
        characterId: c.id,
        characterName: c.name,
        traits: extractTraits((c.description || "") + " " + (c.notes || "")),
        summary: c.description?.slice(0, 200) || "No description available.",
      }));
      return NextResponse.json({ profiles, feedback: [] });
    }

    const characterSummary = ctx.characters
      .map((c) => {
        const parts = [`${c.name}${c.role ? ` (${c.role})` : ""}`];
        if (c.description) parts.push(`Description: ${c.description}`);
        if (c.notes) parts.push(`Notes: ${c.notes}`);
        return parts.join(". ");
      })
      .join("\n\n");

    const textToAnalyze = selectedText || ctx.sceneText;

    const prompt = `You are a character voice coach for a fiction writer.

CHARACTER PROFILES:
${characterSummary}

${textToAnalyze ? `TEXT TO ANALYZE:\n${textToAnalyze.slice(0, 1000)}` : ""}

Task 1: For each character listed, extract their voice traits (speaking style, vocabulary level, emotional tone, speech patterns) as a JSON array.

Task 2: ${
      textToAnalyze
        ? "If the text contains dialogue, identify any lines that sound more like a different character than the one speaking them."
        : "No text provided — skip voice feedback."
    }

Return ONLY valid JSON with this structure:
{
  "profiles": [
    {
      "characterId": "<id>",
      "characterName": "<name>",
      "traits": ["formal speech", "military metaphors", "clipped sentences"],
      "summary": "Short summary of their voice style"
    }
  ],
  "feedback": [
    {
      "characterId": "<id of mismatched character>",
      "characterName": "<name>",
      "issue": "This line reads more like [other character] than [this character]",
      "suggestedVoice": "Formal, military, clipped",
      "selectedText": "The exact dialogue line causing concern"
    }
  ]
}

The "feedback" array should be empty if the text is not dialogue or no voice issues are found.`;

    const rawContent = await runSimpleCompletion({
      userMessage: prompt,
      aiConfig,
      maxTokens: 1000,
      temperature: 0.1,
    });
    let parsed: { profiles?: VoiceProfile[]; feedback?: VoiceFeedback[] } = {};
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    } catch {
      logger.error("Failed to parse voice check response", { rawContent });
    }

    const profiles: VoiceProfile[] = (parsed.profiles ?? []).map((p) => ({
      characterId: p.characterId ?? "",
      characterName: p.characterName ?? "",
      traits: Array.isArray(p.traits) ? p.traits.slice(0, 8).map(String) : [],
      summary: String(p.summary ?? "").slice(0, 300),
    }));

    const feedback: VoiceFeedback[] = (parsed.feedback ?? []).map((f) => ({
      characterId: f.characterId ?? "",
      characterName: f.characterName ?? "",
      issue: String(f.issue ?? "").slice(0, 500),
      suggestedVoice: String(f.suggestedVoice ?? "").slice(0, 200),
      selectedText: String(f.selectedText ?? "").slice(0, 300),
    }));

    return NextResponse.json({ profiles, feedback });
  } catch (error) {
    logger.error("POST /api/projects/[id]/voice-check error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function extractTraits(text: string): string[] {
  if (!text.trim()) return [];
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
  const voiceWords = words.filter((w) =>
    [
      "formal",
      "informal",
      "clipped",
      "verbose",
      "poetic",
      "blunt",
      "witty",
      "sarcastic",
      "earnest",
      "eloquent",
      "gruff",
      "gentle",
      "aggressive",
      "military",
      "scholarly",
      "rustic",
      "noble",
      "common",
    ].includes(w),
  );
  return [...new Set(voiceWords)].slice(0, 5);
}
