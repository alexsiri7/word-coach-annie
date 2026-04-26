import { prisma } from "@/lib/db";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { logger } from "@/lib/logger";
import type { Conversation, ChatMessage } from "@prisma/client";
import type { ChatCompressionSettings, AiProviderConfig } from "@/lib/ai/settings";

function buildCompressionPrompt(existingSummary: string | null, messages: ChatMessage[]): string {
  const historyText = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Writer" : "Annie"}: ${m.content}`)
    .join("\n\n");

  const summarySection = existingSummary
    ? `Previous summary:\n${existingSummary}\n\n`
    : "";

  return `${summarySection}New conversation turns to incorporate:\n\n${historyText}

Write a concise summary of this conversation for use as context in future turns. Preserve:
- Character decisions made by the writer
- Plot points discussed or resolved
- The writer's stated intentions for their story
- Open questions or unresolved threads

Discard:
- Tool call JSON payloads and raw API results
- Intermediate reasoning steps
- Verbatim quotes from the manuscript
- Filler exchanges ("ok", "thanks", "sure")

Write in plain prose, third person, present tense. Max 400 words.`;
}

export async function compressConversation(
  conversation: Conversation,
  messages: ChatMessage[],
  settings: ChatCompressionSettings,
  aiConfig: AiProviderConfig
): Promise<void> {
  const toCompress = messages.slice(0, -settings.chatWindowSize);
  if (toCompress.length === 0) return;

  const compressionModel = settings.compressionModel || aiConfig.model;
  const prompt = buildCompressionPrompt(conversation.summary, toCompress);

  logger.info("compressConversation: compressing", {
    conversationId: conversation.id,
    messageCount: toCompress.length,
  });

  const newSummary = await runSimpleCompletion({
    userMessage: prompt,
    aiConfig: { ...aiConfig, model: compressionModel },
    maxTokens: 600,
    temperature: 0.3,
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      summary: newSummary,
      summarizedThroughMessageId: toCompress.at(-1)!.id,
    },
  });

  logger.info("compressConversation: done", { conversationId: conversation.id });
}
