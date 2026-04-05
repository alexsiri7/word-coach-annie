import { NextRequest, NextResponse } from "next/server";
import { getAiConfig, getAiPreferences, buildPreferenceInstructions } from "@/lib/ai/settings";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { runChatAgent } from "@/lib/ai/adk-agent";

export type InlineAiAction =
  | "rewrite-tighter"
  | "rewrite-vivid"
  | "rewrite-simpler"
  | "continue"
  | "expand"
  | "voice-check"
  | "ask";

const ACTION_PROMPTS: Record<InlineAiAction, (text: string, context: string, ask?: string) => string> = {
  "rewrite-tighter": (text, context) =>
    `Rewrite this passage to be tighter and more concise — cut any filler words, redundant phrases, or unnecessary detail. Keep the same meaning and voice.\n\nContext (surrounding text):\n${context}\n\nPassage to rewrite:\n${text}\n\nReturn ONLY the rewritten text, no explanation.`,

  "rewrite-vivid": (text, context) =>
    `Rewrite this passage to be more vivid and evocative — stronger verbs, sensory detail, concrete imagery. Keep the same meaning and approximate length.\n\nContext (surrounding text):\n${context}\n\nPassage to rewrite:\n${text}\n\nReturn ONLY the rewritten text, no explanation.`,

  "rewrite-simpler": (text, context) =>
    `Rewrite this passage in simpler, clearer language. Replace complex words with everyday ones, shorten sentences, keep it direct.\n\nContext (surrounding text):\n${context}\n\nPassage to rewrite:\n${text}\n\nReturn ONLY the rewritten text, no explanation.`,

  "continue": (text, context) =>
    `Continue the story naturally from where this passage ends. Match the existing voice, pacing, and style. Write 1-3 short paragraphs.\n\nContext (surrounding text):\n${context}\n\nEnd of passage (continue from here):\n${text}\n\nReturn ONLY the continuation, no explanation.`,

  "expand": (text, context) =>
    `Expand this passage with more detail, texture, and depth. Add sensory details, internality, or action beats where appropriate. Stay true to the voice.\n\nContext (surrounding text):\n${context}\n\nPassage to expand:\n${text}\n\nReturn ONLY the expanded text, no explanation.`,

  "voice-check": (text, context) =>
    `Analyze this passage for voice consistency and effectiveness. Comment on: sentence rhythm, word choice, point of view consistency, and any jarring shifts. Be specific and brief.\n\nContext (surrounding text):\n${context}\n\nPassage to review:\n${text}\n\nReturn a brief, specific voice analysis (2-4 sentences). No bullet points.`,

  "ask": (text, context, ask) =>
    `${ask || "What do you think about this passage?"}\n\nContext (surrounding text):\n${context}\n\nSelected text:\n${text}`,
};

// POST /api/ai-inline — apply an AI action to selected text
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { selectedText, sceneContext, action, askPrompt } = body as {
      selectedText: string;
      sceneContext?: string;
      action: InlineAiAction;
      askPrompt?: string;
    };

    if (!selectedText || !action) {
      return NextResponse.json(
        { error: "selectedText and action are required" },
        { status: 400 }
      );
    }

    const sanitizedText = sanitizeInput(selectedText);
    const sanitizedContext = sceneContext ? sanitizeInput(sceneContext.slice(0, 1000)) : "";
    const sanitizedAsk = askPrompt ? sanitizeInput(askPrompt) : undefined;

    const userId = getCurrentUserId(request);
    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI provider not configured. Set API key in AI Settings." },
        { status: 503 }
      );
    }

    const promptFn = ACTION_PROMPTS[action];
    if (!promptFn) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const prompt = promptFn(sanitizedText, sanitizedContext, sanitizedAsk);

    // Load user preferences for system-level behavior guidance
    const prefs = await getAiPreferences(userId);
    const prefInstructions = buildPreferenceInstructions(prefs);

    const { finalContent } = await runChatAgent({
      systemPrompt: prefInstructions,
      chatHistory: [],
      userMessage: prompt,
      aiConfig,
    });

    return NextResponse.json({ result: finalContent.trim() });
  } catch (error) {
    logger.error("POST /api/ai-inline error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
