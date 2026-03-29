import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiConfig } from "@/lib/ai/settings";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import OpenAI from "openai";

export type ManuscriptAnalysisType =
  | "plot-threads"
  | "character-arcs"
  | "consistency-check";

async function buildManuscriptContext(projectId: string) {
  const [project, nodes, storyObjects, relationships] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.structureNode.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      include: {
        contentVersions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, wordCount: true },
        },
      },
    }),
    prisma.storyObject.findMany({
      where: { projectId },
      select: { id: true, type: true, name: true, description: true, role: true },
    }),
    prisma.relationship.findMany({
      where: {
        OR: [
          { fromObject: { projectId } },
          { toObject: { projectId } },
        ],
      },
      include: {
        fromObject: { select: { name: true, type: true } },
        toObject: { select: { name: true, type: true } },
      },
      take: 30,
    }),
  ]);

  if (!project) throw new Error("Project not found");

  const chapters = nodes.filter((n) => n.type === "CHAPTER");
  const scenes = nodes.filter((n) => n.type === "SCENE");

  const outlineWithContent = chapters
    .map((ch) => {
      const chScenes = scenes
        .filter((s) => s.parentId === ch.id)
        .map((s) => {
          const content = s.contentVersions[0]?.content || "";
          const preview = content
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 300);
          return `    Scene: ${s.title} [${s.status}]${s.synopsis ? ` — ${s.synopsis}` : ""}${preview ? `\n      Content preview: ${preview}...` : ""}`;
        })
        .join("\n");
      return `Chapter: ${ch.title}${ch.synopsis ? ` — ${ch.synopsis}` : ""}\n${chScenes}`;
    })
    .join("\n\n");

  const characters = storyObjects
    .filter((o) => o.type === "CHARACTER")
    .map((o) => `${o.name}${o.role ? ` (${o.role})` : ""}${o.description ? `: ${o.description.slice(0, 200)}` : ""}`)
    .join("\n");

  const plotlines = storyObjects
    .filter((o) => o.type === "PLOTLINE")
    .map((o) => `${o.name}${o.description ? `: ${o.description.slice(0, 200)}` : ""}`)
    .join("\n");

  const relationshipsText = relationships
    .filter((r) => r.fromObject && r.toObject)
    .map((r) => `${r.fromObject!.name} → ${r.toObject!.name}: ${r.type}`)
    .join("\n");

  return { project, outlineWithContent, characters, plotlines, relationships: relationshipsText };
}

const ANALYSIS_PROMPTS: Record<ManuscriptAnalysisType, (ctx: Awaited<ReturnType<typeof buildManuscriptContext>>) => string> = {
  "plot-threads": ({ project, outlineWithContent, plotlines }) => `Analyze the plot threads in "${project.title}". Based on the manuscript structure below, identify:
1. **Active threads** — which plot lines are introduced and developed
2. **Dormant threads** — threads introduced but not recently advanced
3. **Unresolved threads** — threads that need payoff
4. **Suggested connections** — opportunities to weave threads together

${plotlines ? `Known plotlines:\n${plotlines}\n` : ""}
Manuscript structure:
${outlineWithContent || "(No scenes yet)"}

Format your response as a structured report with clear sections. Be specific about which scenes/chapters contain each thread. Keep it concise and actionable.`,

  "character-arcs": ({ project, outlineWithContent, characters, relationships }) => `Analyze character arcs in "${project.title}". For each major character, identify:
1. **Arc type** — transformation, revelation, flat/steadfast, fallen
2. **Current position** — where they are in their arc based on the manuscript
3. **Missing beats** — what arc beats are absent or underdeveloped
4. **Key relationships** — how relationships drive or reflect the arc

Known characters:
${characters || "(No characters defined)"}

Relationships:
${relationships || "(No relationships defined)"}

Manuscript structure:
${outlineWithContent || "(No scenes yet)"}

Format your response as a structured report with one section per major character. Be specific about which scenes show arc development.`,

  "consistency-check": ({ project, outlineWithContent, characters }) => `Perform a consistency check on "${project.title}". Look for potential contradictions or inconsistencies in:
1. **Character details** — appearance, backstory, traits mentioned differently
2. **Timeline** — events out of chronological order, impossible timing
3. **World/setting** — location descriptions that contradict each other
4. **Plot logic** — cause-effect gaps, character motivations that don't hold

Known characters:
${characters || "(No characters defined)"}

Manuscript structure:
${outlineWithContent || "(No scenes yet)"}

Format as a structured report. List specific potential issues with scene references where possible. If no issues are found in a category, say so briefly. Be honest but constructive.`,
};

// POST /api/ai-manuscript — run manuscript-level analysis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, analysisType } = body as {
      projectId: string;
      analysisType: ManuscriptAnalysisType;
    };

    if (!projectId || !analysisType) {
      return NextResponse.json(
        { error: "projectId and analysisType are required" },
        { status: 400 }
      );
    }

    const userId = getCurrentUserId(request);
    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI provider not configured. Set API key in AI Settings." },
        { status: 503 }
      );
    }

    const promptFn = ANALYSIS_PROMPTS[analysisType];
    if (!promptFn) {
      return NextResponse.json({ error: "Unknown analysis type" }, { status: 400 });
    }

    const ctx = await buildManuscriptContext(projectId);
    const prompt = promptFn(ctx);

    const client = new OpenAI({
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseUrl || undefined,
    });

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
      temperature: 0.5,
    });

    const result = response.choices[0]?.message?.content?.trim() || "";
    return NextResponse.json({ result, analysisType });
  } catch (error) {
    logger.error("POST /api/ai-manuscript error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
