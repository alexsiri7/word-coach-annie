import { NextRequest, NextResponse } from "next/server";
import { getAiConfig, getAiPreferences, buildPreferenceInstructions } from "@/lib/ai/settings";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { ANNIE_HARD_RULE } from "@/lib/ai/annie-persona";

export type InlineAiAction =
  | "rewrite-tighter"
  | "rewrite-vivid"
  | "rewrite-simpler"
  | "continue"
  | "expand"
  | "voice-check"
  | "ask";

const ACTION_INSTRUCTIONS: Record<InlineAiAction, string | ((askPrompt?: string) => string)> = {
  "rewrite-tighter": "Coach the writer on how to make this passage tighter and more concise. Identify specific filler words, redundant phrases, or unnecessary detail. Show what to cut and why — but the rewriting is the author's job.",
  "rewrite-vivid": "Coach the writer on how to make this passage more vivid and evocative. Point out where stronger verbs, sensory detail, or concrete imagery would help. Give specific suggestions, but don't rewrite it for them.",
  "rewrite-simpler": "Coach the writer on how to simplify this passage. Flag complex words, long sentences, and indirect constructions. Suggest simpler alternatives, but let the author do the rewriting.",
  "continue": "The writer wants to continue from here but is stuck. Help them plan what comes next: suggest 2-3 possible directions with beat-level detail (what happens, what shifts, what the reader feels). Don't write the prose — map the path forward.",
  "expand": "The writer wants to expand this passage. Coach them on where to add depth: identify spots for sensory detail, internality, or action beats. Explain what each addition would accomplish. Don't write it — guide it.",
  "voice-check": "Analyze this passage for voice consistency and effectiveness. Comment on: sentence rhythm, word choice, point of view consistency, and any jarring shifts. Be specific and brief (2-4 sentences).",
  "ask": (askPrompt?: string) => askPrompt || "What do you think about this passage?",
};

const MAX_SELECTED_TEXT_LENGTH = 50_000;
const MAX_ASK_PROMPT_LENGTH = 1_000;

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
    if (selectedText.length > MAX_SELECTED_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `SelectedText exceeds maximum length of ${MAX_SELECTED_TEXT_LENGTH} characters` },
        { status: 413 }
      );
    }
    if (askPrompt && askPrompt.length > MAX_ASK_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `AskPrompt exceeds maximum length of ${MAX_ASK_PROMPT_LENGTH} characters` },
        { status: 413 }
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

    const instructionOrFn = ACTION_INSTRUCTIONS[action];
    if (!instructionOrFn) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const instruction = typeof instructionOrFn === "function"
      ? instructionOrFn(sanitizedAsk)
      : instructionOrFn;
    const contextBlock = sanitizedContext ? `\nContext (surrounding text):\n${sanitizedContext}\n` : "";
    const textLabel = action === "continue" ? "End of passage (continue from here)" : action === "voice-check" ? "Passage to review" : "Selected text";
    const prompt = `${instruction}${contextBlock}\n${textLabel}:\n${sanitizedText}`;

    // Load user preferences for system-level behavior guidance
    const prefs = await getAiPreferences(userId);
    const prefInstructions = buildPreferenceInstructions(prefs);

    const result = await runSimpleCompletion({
      systemPrompt: ANNIE_HARD_RULE + "\n\n" + prefInstructions,
      userMessage: prompt,
      aiConfig,
      maxTokens: 1000,
      temperature: 0.7,
    });
    return NextResponse.json({ result });
  } catch (error) {
    logger.error("POST /api/ai-inline error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
