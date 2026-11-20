import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAiConfig } from "@/lib/ai/settings";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { summarizeToolResult } from "@/lib/ai/chat-context";
import { ChatController } from "@/lib/controllers/chat";
import { validationErrorResponse } from "@/lib/request-validation";

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_ID_LENGTH = 100;
const CHAT_POST_REQUIRED = "conversationId and message are required";

const ChatPostSchema = z.object({
  conversationId: z
    .string({ error: CHAT_POST_REQUIRED })
    .min(1, CHAT_POST_REQUIRED)
    .max(MAX_ID_LENGTH, `ConversationId exceeds maximum length of ${MAX_ID_LENGTH} characters`),
  message: z
    .string({ error: CHAT_POST_REQUIRED })
    .min(1, CHAT_POST_REQUIRED)
    .max(MAX_MESSAGE_LENGTH, `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`),
  sceneContext: z.string().optional(),
  reviewSceneId: z.string().optional(),
});

// GET /api/chat?conversationId=X or ?projectId=X — load conversation + chat history
export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!conversationId && !projectId) {
      return NextResponse.json({ error: "conversationId or projectId is required" }, { status: 400 });
    }

    const userId = getCurrentUserId(request);

    let conversation;
    if (conversationId) {
      conversation = await ChatController.getConversation(conversationId);
      if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    } else {
      const access = await verifyProjectWriteAccess(projectId!, userId, request.headers.get("x-user-email"));
      if (!access.authorized) return access.response;

      conversation = await ChatController.getOrCreateLatestConversation(projectId!);
    }

    const access = await verifyProjectWriteAccess(
      conversation.projectId,
      userId,
      request.headers.get("x-user-email")
    );
    if (!access.authorized) return access.response;

    const messages = await ChatController.listMessages(conversation.id);

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    logger.error("GET /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/chat — send message, get streaming AI response with tool use
export async function POST(request: NextRequest) {
  try {
    const parsed = ChatPostSchema.safeParse(await request.json());
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const { conversationId, message, sceneContext, reviewSceneId } = parsed.data;

    const userId = getCurrentUserId(request);

    const conversation = await ChatController.getConversationOrThrow(conversationId);

    const access = await verifyProjectWriteAccess(
      conversation.projectId,
      userId,
      request.headers.get("x-user-email")
    );
    if (!access.authorized) return access.response;

    // Sanitize user input to prevent stored XSS
    const sanitizedMessage = sanitizeInput(message);

    // Load AI provider config (needed before compression and agent call)
    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI provider not configured. Set API key in AI Settings or AI_API_KEY env var." },
        { status: 503 }
      );
    }

    const { finalContent, toolLog } = await ChatController.runTurn({
      conversation,
      message: sanitizedMessage,
      sceneContext,
      reviewSceneId,
      userId,
      aiConfig,
      toolContext: {
        userId,
        userEmail: request.headers.get("x-user-email"),
        projectId: conversation.projectId,
        role: access.role,
      },
    });

    // Stream via SSE — tool activity events first, then final content
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          } catch (err) {
            // Client disconnected — absorb known "controller closed" errors, log anything unexpected.
            // String matching is intentional: Node.js/undici throws a plain TypeError here (no typed
            // DOMException), so there's no better discriminator than the message text.
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes("Controller is already closed") && !msg.includes("Invalid state")) {
              logger.error("POST /api/chat: unexpected error in stream enqueue", err);
            }
          }
        };

        try {
          // Send tool activity events
          for (const entry of toolLog) {
            send({
              type: "tool_call",
              name: entry.tool,
              args: entry.args,
            });

            send({
              type: "tool_result",
              name: entry.tool,
              summary: summarizeToolResult(entry),
            });
          }

          // Stream the final content in chunks
          const chunkSize = 20;
          for (let i = 0; i < finalContent.length; i += chunkSize) {
            const chunk = finalContent.slice(i, i + chunkSize);
            send({ type: "content", content: chunk });
          }

          await ChatController.saveReply(conversation, finalContent, aiConfig);

          try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); } catch { /* already closed */ }
          try { controller.close(); } catch { /* already closed */ }
        } catch (err) {
          logger.error("Stream error", err);
          send({ error: "Stream error" });
          try { controller.close(); } catch { /* already closed */ }
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
    logger.error("POST /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/chat?conversationId=X — clear chat history
export async function DELETE(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const userId = getCurrentUserId(request);

    const conversation = await ChatController.getConversation(conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const access = await verifyProjectWriteAccess(
      conversation.projectId,
      userId,
      request.headers.get("x-user-email")
    );
    if (!access.authorized) return access.response;

    await ChatController.clearHistory(conversationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("DELETE /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
