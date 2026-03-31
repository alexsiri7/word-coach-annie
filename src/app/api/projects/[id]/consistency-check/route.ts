import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";
import { getConsistencyContext } from "@/mcp/tools/coaching";
import OpenAI from "openai";

export interface ConsistencyAlert {
  id: string;
  type: "CHARACTER_ATTRIBUTE" | "PLOT_CONTRADICTION" | "TIMELINE" | "OTHER";
  severity: "high" | "medium" | "low";
  description: string;
  sceneId: string;
  sceneTitle: string;
  sourceSceneId?: string;
  sourceSceneTitle?: string;
  objectName?: string;
  dismissed?: boolean;
}

/**
 * POST /api/projects/[id]/consistency-check
 *
 * Runs an AI consistency analysis on the project.
 * Uses shared context from MCP coaching module.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectAccess(projectId, userId);
  if (!access.authorized) return access.response;

  let focusSceneId: string | undefined;
  try {
    const body = await request.json();
    focusSceneId = body.sceneId;
  } catch {
    // No body or empty body
  }

  try {
    const ctx = await getConsistencyContext(projectId, focusSceneId);

    if (ctx.characters.length === 0 || ctx.scenes.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json({ alerts: [], warning: "AI not configured" });
    }

    const characterSummary = ctx.characters
      .map((c) => {
        const parts = [`${c.name}${c.role ? ` (${c.role})` : ""}`];
        if (c.description) parts.push(`Description: ${c.description}`);
        if (c.notes) parts.push(`Notes: ${c.notes}`);
        return parts.join(". ");
      })
      .join("\n");

    const scenesSummary = ctx.scenes
      .map((s) => `SCENE "${s.title}" (id:${s.id}):\n${s.content}`)
      .join("\n\n---\n\n");

    const prompt = `You are a manuscript consistency checker for the story "${ctx.project.title}".

CHARACTER PROFILES:
${characterSummary}

SCENE CONTENT:
${scenesSummary}

Identify specific, concrete contradictions or inconsistencies in the scenes above. Look for:
1. Character attribute contradictions (eye color, hair, age, physical traits mentioned differently)
2. Character behavior that contradicts their established personality
3. Timeline or continuity errors
4. Factual contradictions (a character dies but later appears, a location described differently)

For each issue found, provide a JSON object. Return ONLY a valid JSON array (no markdown):
[
  {
    "type": "CHARACTER_ATTRIBUTE" | "PLOT_CONTRADICTION" | "TIMELINE" | "OTHER",
    "severity": "high" | "medium" | "low",
    "description": "Specific description of the contradiction",
    "sceneTitle": "Title of the scene where contradiction appears",
    "sourceSceneTitle": "Title of the scene with the original information (if different)",
    "objectName": "Character or object name involved"
  }
]

If no contradictions are found, return [].
Only report clear, specific contradictions. Do not report vague impressions.`;

    const client = new OpenAI({
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseUrl || undefined,
    });

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const rawContent = response.choices[0]?.message?.content ?? "[]";
    let parsed: {
      type: string;
      severity: string;
      description: string;
      sceneTitle: string;
      sourceSceneTitle?: string;
      objectName?: string;
    }[] = [];
    try {
      const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "[]");
      if (!Array.isArray(parsed)) parsed = [];
    } catch {
      logger.error("Failed to parse consistency check response", { rawContent });
      parsed = [];
    }

    const sceneByTitle = new Map(ctx.scenes.map((s) => [s.title, s.id]));

    const alerts: ConsistencyAlert[] = parsed.slice(0, 20).map((item, idx) => ({
      id: `alert-${Date.now()}-${idx}`,
      type: (["CHARACTER_ATTRIBUTE", "PLOT_CONTRADICTION", "TIMELINE", "OTHER"].includes(item.type)
        ? item.type
        : "OTHER") as ConsistencyAlert["type"],
      severity: (["high", "medium", "low"].includes(item.severity)
        ? item.severity
        : "medium") as ConsistencyAlert["severity"],
      description: String(item.description ?? "").slice(0, 500),
      sceneId: sceneByTitle.get(item.sceneTitle) ?? ctx.scenes[0]?.id ?? "",
      sceneTitle: String(item.sceneTitle ?? ""),
      sourceSceneId: item.sourceSceneTitle ? sceneByTitle.get(item.sourceSceneTitle) : undefined,
      sourceSceneTitle: item.sourceSceneTitle ? String(item.sourceSceneTitle) : undefined,
      objectName: item.objectName ? String(item.objectName).slice(0, 100) : undefined,
    }));

    return NextResponse.json({ alerts });
  } catch (error) {
    logger.error("POST /api/projects/[id]/consistency-check error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
