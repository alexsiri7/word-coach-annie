import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";
import OpenAI from "openai";

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
 * Body: { sceneId: string, selectedText?: string }
 * Returns: { profiles: VoiceProfile[], feedback: VoiceFeedback[] }
 *
 * profiles: established voice traits for each character linked to this scene
 * feedback: voice consistency issues found (only when selectedText is provided or scene has dialogue)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectAccess(projectId, userId);
  if (!access.authorized) return access.response;

  let sceneId: string | undefined;
  let selectedText: string | undefined;
  try {
    const body = await request.json();
    sceneId = body.sceneId;
    selectedText = body.selectedText;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!sceneId) {
    return NextResponse.json({ error: "sceneId is required" }, { status: 400 });
  }

  try {
    // Find characters linked to this scene via relationships
    const sceneRelationships = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromNodeId: sceneId },
          { toNodeId: sceneId },
        ],
      },
      select: {
        fromObjectId: true,
        toObjectId: true,
      },
    });

    const linkedObjectIds = new Set<string>();
    for (const rel of sceneRelationships) {
      if (rel.fromObjectId) linkedObjectIds.add(rel.fromObjectId);
      if (rel.toObjectId) linkedObjectIds.add(rel.toObjectId);
    }

    if (linkedObjectIds.size === 0) {
      return NextResponse.json({ profiles: [], feedback: [] });
    }

    // Load characters from linked objects
    const characters = await prisma.storyObject.findMany({
      where: {
        id: { in: Array.from(linkedObjectIds) },
        type: "CHARACTER",
        projectId,
      },
      select: { id: true, name: true, description: true, notes: true, role: true },
    });

    if (characters.length === 0) {
      return NextResponse.json({ profiles: [], feedback: [] });
    }

    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      // Return basic profiles without AI feedback
      const profiles: VoiceProfile[] = characters.map((c) => ({
        characterId: c.id,
        characterName: c.name,
        traits: extractTraits(c.description + " " + c.notes),
        summary: c.description.slice(0, 200) || "No description available.",
      }));
      return NextResponse.json({ profiles, feedback: [] });
    }

    const client = new OpenAI({
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseUrl || undefined,
    });

    const characterSummary = characters
      .map((c) => {
        const parts = [`${c.name}${c.role ? ` (${c.role})` : ""}`];
        if (c.description) parts.push(`Description: ${c.description.slice(0, 400)}`);
        if (c.notes) parts.push(`Notes: ${c.notes.slice(0, 200)}`);
        return parts.join(". ");
      })
      .join("\n\n");

    const textToAnalyze = selectedText || await getSceneText(sceneId);

    const prompt = `You are a character voice coach for a fiction writer.

CHARACTER PROFILES:
${characterSummary}

${textToAnalyze ? `TEXT TO ANALYZE:\n${textToAnalyze.slice(0, 1000)}` : ""}

Task 1: For each character listed, extract their voice traits (speaking style, vocabulary level, emotional tone, speech patterns) as a JSON array.

Task 2: ${textToAnalyze
  ? "If the text contains dialogue, identify any lines that sound more like a different character than the one speaking them."
  : "No text provided — skip voice feedback."}

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

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const rawContent = response.choices[0]?.message?.content ?? "{}";
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
      { status: 500 }
    );
  }
}

async function getSceneText(sceneId: string): Promise<string> {
  const version = await prisma.contentVersion.findFirst({
    where: { nodeId: sceneId },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  if (!version?.content) return "";
  return version.content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

function extractTraits(text: string): string[] {
  if (!text.trim()) return [];
  const words = text.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
  const voiceWords = words.filter((w) =>
    ["formal", "informal", "clipped", "verbose", "poetic", "blunt", "witty",
     "sarcastic", "earnest", "eloquent", "gruff", "gentle", "aggressive",
     "military", "scholarly", "rustic", "noble", "common"].includes(w)
  );
  return [...new Set(voiceWords)].slice(0, 5);
}
