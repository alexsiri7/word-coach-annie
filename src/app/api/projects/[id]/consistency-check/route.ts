import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";
import OpenAI from "openai";

export interface ConsistencyAlert {
  id: string;
  type: "CHARACTER_ATTRIBUTE" | "PLOT_CONTRADICTION" | "TIMELINE" | "OTHER";
  severity: "high" | "medium" | "low";
  description: string;
  /** Scene where contradiction was found */
  sceneId: string;
  sceneTitle: string;
  /** Scene where the original (conflicting) information lives */
  sourceSceneId?: string;
  sourceSceneTitle?: string;
  /** The object (character, location, etc.) involved */
  objectName?: string;
  dismissed?: boolean;
}

/**
 * POST /api/projects/[id]/consistency-check
 *
 * Runs an AI consistency analysis on the project.
 * Body: { sceneId?: string }  — if provided, focus on that scene
 * Returns: { alerts: ConsistencyAlert[] }
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
    // Load project data for analysis
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Load characters with their descriptions
    const characters = await prisma.storyObject.findMany({
      where: { projectId, type: "CHARACTER" },
      select: { id: true, name: true, description: true, notes: true, role: true },
    });

    if (characters.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    // Load scenes with content (limited for token efficiency)
    const sceneQuery: Parameters<typeof prisma.structureNode.findMany>[0] = {
      where: { projectId, type: "SCENE" },
      orderBy: { orderIndex: "asc" },
      select: { id: true, title: true, parentId: true },
    };
    const scenes = await prisma.structureNode.findMany(sceneQuery);

    // Load latest content for each relevant scene
    const scenesWithContent: { id: string; title: string; content: string }[] = [];

    const targetSceneIds = focusSceneId
      ? [focusSceneId]
      : scenes.slice(0, 20).map((s) => s.id); // limit to 20 scenes

    for (const sceneId of targetSceneIds) {
      const version = await prisma.contentVersion.findFirst({
        where: { nodeId: sceneId },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      });
      const scene = scenes.find((s) => s.id === sceneId);
      if (scene && version?.content) {
        // Strip HTML and beat comments for analysis
        const textContent = version.content
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 800); // limit per scene
        if (textContent.length > 50) {
          scenesWithContent.push({
            id: sceneId,
            title: scene.title,
            content: textContent,
          });
        }
      }
    }

    if (scenesWithContent.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json({ alerts: [], warning: "AI not configured" });
    }

    // Build prompt for consistency analysis
    const characterSummary = characters
      .map((c) => {
        const parts = [`${c.name}${c.role ? ` (${c.role})` : ""}`];
        if (c.description) parts.push(`Description: ${c.description.slice(0, 300)}`);
        if (c.notes) parts.push(`Notes: ${c.notes.slice(0, 200)}`);
        return parts.join(". ");
      })
      .join("\n");

    const scenesSummary = scenesWithContent
      .map((s) => `SCENE "${s.title}" (id:${s.id}):\n${s.content}`)
      .join("\n\n---\n\n");

    const prompt = `You are a manuscript consistency checker for the story "${project.title}".

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

    // Map parsed results to alerts, resolving scene IDs
    const sceneByTitle = new Map(scenesWithContent.map((s) => [s.title, s.id]));

    const alerts: ConsistencyAlert[] = parsed.slice(0, 20).map((item, idx) => ({
      id: `alert-${Date.now()}-${idx}`,
      type: (["CHARACTER_ATTRIBUTE", "PLOT_CONTRADICTION", "TIMELINE", "OTHER"].includes(item.type)
        ? item.type
        : "OTHER") as ConsistencyAlert["type"],
      severity: (["high", "medium", "low"].includes(item.severity)
        ? item.severity
        : "medium") as ConsistencyAlert["severity"],
      description: String(item.description ?? "").slice(0, 500),
      sceneId: sceneByTitle.get(item.sceneTitle) ?? scenesWithContent[0]?.id ?? "",
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
