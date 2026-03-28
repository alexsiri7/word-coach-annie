import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiConfig } from "@/lib/ai/settings";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { runChatAgent } from "@/lib/ai/adk-agent";

type InlineAction =
  | "tighten"
  | "vivid"
  | "simpler"
  | "continue"
  | "expand"
  | "voice-check"
  | "custom";

const ACTION_PROMPTS: Record<InlineAction, (text: string, custom?: string) => string> = {
  tighten: (text) =>
    `Rewrite the following passage to be tighter and more concise. Remove filler words and redundant phrases while preserving the meaning and voice. Return only the rewritten text, no explanation.\n\nPassage:\n${text}`,
  vivid: (text) =>
    `Rewrite the following passage to be more vivid and sensory. Add concrete details, stronger verbs, and imagery. Maintain the author's voice and intent. Return only the rewritten text, no explanation.\n\nPassage:\n${text}`,
  simpler: (text) =>
    `Rewrite the following passage in simpler, clearer language. Reduce complexity without losing the meaning or tone. Return only the rewritten text, no explanation.\n\nPassage:\n${text}`,
  continue: (text) =>
    `Continue the following passage naturally, matching the style, voice, and pacing. Write roughly the same length as what's provided. Return only the continuation, no explanation.\n\nPassage:\n${text}`,
  expand: (text) =>
    `Expand the following passage with more detail, texture, and depth. Add context, interiority, or sensory detail that enriches the scene. Match the existing style. Return only the expanded text, no explanation.\n\nPassage:\n${text}`,
  "voice-check": (text) =>
    `Analyze the following passage for character voice and dialogue authenticity. Identify if characters sound distinct, if dialogue feels natural, and if the narrative voice is consistent. Give brief, actionable feedback.\n\nPassage:\n${text}`,
  custom: (text, custom) =>
    `${custom}\n\nPassage:\n${text}`,
};

// POST /api/ai-inline — run a targeted inline AI action on selected text
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, action, selectedText, customInstruction, sceneId } = body as {
      projectId: string;
      action: InlineAction;
      selectedText: string;
      customInstruction?: string;
      sceneId?: string;
    };

    if (!projectId || !action || !selectedText) {
      return NextResponse.json(
        { error: "projectId, action, and selectedText are required" },
        { status: 400 }
      );
    }

    const sanitizedText = sanitizeInput(selectedText);
    const sanitizedInstruction = customInstruction ? sanitizeInput(customInstruction) : undefined;

    // Get minimal project context for system prompt
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true, genre: true, synopsis: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get scene context if provided
    let sceneContext = "";
    if (sceneId) {
      const scene = await prisma.structureNode.findUnique({
        where: { id: sceneId },
        select: { title: true, synopsis: true, status: true },
      });
      if (scene) {
        sceneContext = `\nCurrent scene: "${scene.title}" [${scene.status}]${scene.synopsis ? `\nSynopsis: ${scene.synopsis}` : ""}`;
      }
    }

    const systemPrompt = `You are a skilled writing editor working on "${project.title}"${project.genre ? ` (${project.genre})` : ""}.${project.synopsis ? `\nProject: ${project.synopsis}` : ""}${sceneContext}

Perform the requested editing task precisely. Match the author's existing voice and style. Return only the result — no meta-commentary, no explanation, no preamble.`;

    const promptFn = ACTION_PROMPTS[action];
    if (!promptFn) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    const userMessage = promptFn(sanitizedText, sanitizedInstruction);

    const userId = getCurrentUserId(request);
    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI provider not configured." },
        { status: 503 }
      );
    }

    const { finalContent } = await runChatAgent({
      systemPrompt,
      chatHistory: [],
      userMessage,
      aiConfig,
    });

    // Stream the result
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        try {
          const chunkSize = 20;
          for (let i = 0; i < finalContent.length; i += chunkSize) {
            send({ type: "content", content: finalContent.slice(i, i + chunkSize) });
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          logger.error("Inline AI stream error", err);
          send({ error: "Stream error" });
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("POST /api/ai-inline error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
