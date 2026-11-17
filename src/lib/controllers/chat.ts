import type { Conversation } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getAiPreferences, buildPreferenceInstructions, getCompressionSettings } from "@/lib/ai/settings";
import type { AiProviderConfig } from "@/lib/ai/settings";
import { runChatAgent, runSimpleCompletion } from "@/lib/ai/adk-agent";
import type { ChatAgentResult } from "@/lib/ai/adk-agent";
import type { ToolContext } from "@/lib/ai/adk-tools";
import { compressConversation } from "@/lib/ai/chat-compression";
import {
  buildCoachSystemPrompt,
  buildReviewSystemPrompt,
  composeSystemPrompt,
  formatStoryContext,
  formatToolLog,
  historyFetchLimit,
  selectHistoryWindow,
} from "@/lib/ai/chat-context";
import { reviewSkillForStatus } from "@/lib/review-routing";
import { getSceneFocus } from "@/mcp/tools/coaching";
import { loadSkill } from "@/mcp/skills";

const AGENT_TIMEOUT_MS = 60_000;

export interface ChatTurn {
  conversation: Conversation;
  message: string;
  sceneContext?: string;
  reviewSceneId?: string;
  userId: string | null;
  aiConfig: AiProviderConfig;
  toolContext: ToolContext;
}

export class ChatController {
  static getConversation(conversationId: string) {
    return prisma.conversation.findUnique({ where: { id: conversationId } });
  }

  static getConversationOrThrow(conversationId: string) {
    return prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  }

  static async getOrCreateLatestConversation(projectId: string) {
    const latest = await prisma.conversation.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return latest ?? prisma.conversation.create({ data: { projectId, title: "Chat" } });
  }

  static listMessages(conversationId: string) {
    return prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async clearHistory(conversationId: string): Promise<void> {
    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { conversationId } }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { summary: null, summarizedThroughMessageId: null },
      }),
    ]);
  }

  /**
   * Records the user's message and runs the agent over the recent history,
   * starting a compaction when the history has overflowed. Tool interactions
   * are saved to the history; the reply is saved separately by `saveReply`.
   */
  static async runTurn(turn: ChatTurn): Promise<ChatAgentResult> {
    const { conversation, message, aiConfig, userId } = turn;

    await prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "user", content: message },
    });

    const history = await ChatController.loadUncompactedHistory(conversation, userId);
    const { window, toCompress } = selectHistoryWindow(history.messages, history.settings);
    if (toCompress) {
      compressConversation(conversation, toCompress, history.settings, aiConfig).catch(
        (err) => logger.error("compressConversation failed", err)
      );
    }

    const base = (conversation.type ?? "").startsWith("review")
      ? await ChatController.reviewPrompt(conversation.projectId, conversation.type ?? "review-editor")
      : await ChatController.coachPrompt(conversation.projectId);
    const skill = turn.reviewSceneId
      ? await ChatController.reviewSkill(turn.reviewSceneId, conversation.projectId)
      : null;
    const preferenceInstructions = buildPreferenceInstructions(await getAiPreferences(userId));

    const agentPromise = runChatAgent({
      systemPrompt: composeSystemPrompt({
        base,
        summary: conversation.summary,
        sceneContext: turn.sceneContext,
        skill,
        preferenceInstructions,
      }),
      chatHistory: window.map((m) => ({ role: m.role, content: m.content })),
      userMessage: message,
      aiConfig,
      toolContext: turn.toolContext,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`AI request timed out (model: ${aiConfig.model})`)), AGENT_TIMEOUT_MS)
    );
    const result = await Promise.race([agentPromise, timeoutPromise]);

    if (result.toolLog.length > 0) {
      await prisma.chatMessage.create({
        data: { conversationId: conversation.id, role: "system", content: formatToolLog(result.toolLog) },
      });
    }
    return result;
  }

  /** Saves the assistant's reply and names a new conversation after its first exchange. */
  static async saveReply(conversation: Conversation, finalContent: string, aiConfig: AiProviderConfig): Promise<void> {
    if (!finalContent) return;
    await prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "assistant", content: finalContent },
    });
    if (conversation.title === "New chat") {
      ChatController.autoTitle(conversation.id, aiConfig).catch(
        (err) => logger.error("autoTitle failed", { conversationId: conversation.id, error: err })
      );
    }
  }

  private static async loadUncompactedHistory(conversation: Conversation, userId: string | null) {
    let afterDate: Date | undefined;
    if (conversation.summarizedThroughMessageId) {
      const pivot = await prisma.chatMessage.findUnique({
        where: { id: conversation.summarizedThroughMessageId },
        select: { createdAt: true },
      });
      afterDate = pivot?.createdAt ?? new Date(0);
    }

    const settings = await getCompressionSettings(userId);
    const messages = await prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(afterDate ? { createdAt: { gt: afterDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: historyFetchLimit(settings),
    });
    return { messages, settings };
  }

  private static async coachPrompt(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        structureNodes: {
          orderBy: { orderIndex: "asc" },
          select: { id: true, type: true, title: true, parentId: true, synopsis: true, status: true },
        },
        storyObjects: {
          select: { type: true, name: true, description: true, role: true },
        },
      },
    });
    if (!project) throw new Error("Project not found");

    const universe = project.universeId
      ? await prisma.universe.findUnique({
          where: { id: project.universeId },
          include: {
            worldObjects: {
              include: { timeline: { orderBy: { orderIndex: "asc" } } },
              orderBy: [{ type: "asc" }, { name: "asc" }],
            },
          },
        })
      : null;
    if (project.universeId && !universe) {
      logger.warn("Universe not found for project — universe context omitted", {
        projectId,
        universeId: project.universeId,
      });
    }

    return buildCoachSystemPrompt(
      formatStoryContext({
        project,
        nodes: project.structureNodes,
        storyObjects: project.storyObjects,
        universe,
      })
    );
  }

  private static async reviewPrompt(projectId: string, conversationType: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("Project not found");
    return buildReviewSystemPrompt(conversationType, project.title);
  }

  /** The review skill for the scene's status, or null when the scene can't be used. */
  private static async reviewSkill(reviewSceneId: string, projectId: string) {
    try {
      const focus = await getSceneFocus(reviewSceneId);
      if (focus.scene.projectId !== projectId) {
        logger.warn("reviewSceneId belongs to a different project — ignoring", {
          reviewSceneId,
          sceneProjId: focus.scene.projectId,
          convProjId: projectId,
        });
        return null;
      }
      const skill = loadSkill(reviewSkillForStatus(focus.scene.status as string));
      return skill
        ? { name: skill.metadata.name, description: skill.metadata.description, instructions: skill.instructions }
        : null;
    } catch (err) {
      logger.warn("Could not load review skill for scene", { reviewSceneId, err });
      return null;
    }
  }

  private static async autoTitle(conversationId: string, aiConfig: AiProviderConfig): Promise<void> {
    const assistantCount = await prisma.chatMessage.count({
      where: { conversationId, role: "assistant" },
    });
    if (assistantCount !== 1) return;

    const firstUserMsg = await prisma.chatMessage.findFirst({
      where: { conversationId, role: "user" },
      orderBy: { createdAt: "asc" },
      select: { content: true },
    });
    if (!firstUserMsg) return;

    const title = await runSimpleCompletion({
      systemPrompt:
        "Generate a short title (3–6 words) for a writing coach conversation. Return only the title, no quotes, no punctuation at the end.",
      userMessage: firstUserMsg.content.slice(0, 500),
      aiConfig,
      maxTokens: 20,
      temperature: 0.3,
    });
    const cleanTitle = title.replace(/^["']|["']$/g, "").trim().slice(0, 100);
    if (cleanTitle) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: cleanTitle },
      });
    }
  }
}
