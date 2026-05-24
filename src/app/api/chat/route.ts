import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiConfig, getAiPreferences, buildPreferenceInstructions, getCompressionSettings } from "@/lib/ai/settings";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { runChatAgent, runSimpleCompletion } from "@/lib/ai/adk-agent";
import { compressConversation } from "@/lib/ai/chat-compression";
import type { AiProviderConfig } from "@/lib/ai/settings";
import { ANNIE_HARD_RULE } from "@/lib/ai/annie-persona";

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_ID_LENGTH = 100;

async function buildSystemPrompt(projectId: string): Promise<string> {
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

  const chapters = project.structureNodes.filter((n) => n.type === "CHAPTER");
  const scenes = project.structureNodes.filter((n) => n.type === "SCENE");
  const outlineSummary = chapters
    .map((ch) => {
      const chScenes = scenes
        .filter((s) => s.parentId === ch.id)
        .map((s) => `    - ${s.title} [${s.status}]${s.synopsis ? `: ${s.synopsis}` : ""}`)
        .join("\n");
      return `  ${ch.title}${ch.synopsis ? ` — ${ch.synopsis}` : ""}\n${chScenes}`;
    })
    .join("\n");

  const grouped: Record<string, typeof project.storyObjects> = {};
  for (const obj of project.storyObjects) {
    if (!grouped[obj.type]) grouped[obj.type] = [];
    grouped[obj.type].push(obj);
  }

  const objectsSummary = Object.entries(grouped)
    .map(([type, objs]) => {
      const items = objs
        .map((o) => `  - ${o.name}${o.role ? ` (${o.role})` : ""}${o.description ? `: ${o.description.slice(0, 150)}` : ""}`)
        .join("\n");
      return `${type}:\n${items}`;
    })
    .join("\n\n");

  let universeSummary = "";
  if (project.universeId) {
    const universe = await prisma.universe.findUnique({
      where: { id: project.universeId },
      include: {
        worldObjects: {
          include: { timeline: { orderBy: { orderIndex: "asc" } } },
          orderBy: [{ type: "asc" }, { name: "asc" }],
        },
      },
    });
    if (!universe) {
      logger.warn("Universe not found for project — universe context omitted", {
        projectId,
        universeId: project.universeId,
      });
    } else if (universe.worldObjects.length > 0) {
      const groupedWO: Record<string, typeof universe.worldObjects> = {};
      for (const wo of universe.worldObjects) {
        if (!groupedWO[wo.type]) groupedWO[wo.type] = [];
        groupedWO[wo.type].push(wo);
      }
      const woSections = Object.entries(groupedWO)
        .map(([type, objs]) => {
          const items = objs
            .map((o) => {
              const base = `  - ${o.name}${o.description ? `: ${o.description.slice(0, 150)}` : ""}`;
              if (o.timeline.length === 0) return base;
              const states = o.timeline
                .map((e) => `    [${e.label}]${e.description ? ` ${e.description.slice(0, 100)}` : ""}`)
                .join("\n");
              return `${base}\n${states}`;
            })
            .join("\n");
          return `${type}:\n${items}`;
        })
        .join("\n\n");
      universeSummary = `\n\n## Shared Universe: ${universe.title}${universe.description ? `\n${universe.description.slice(0, 200)}` : ""}\n\n${woSections}`;
    }
  }

  return `${ANNIE_HARD_RULE}You're helping with "${project.title}"${project.genre ? ` (${project.genre})` : ""}.

## Story Context

${project.synopsis ? `SYNOPSIS: ${project.synopsis}\n` : ""}
STORY STRUCTURE:
${outlineSummary || "(No chapters yet)"}

${objectsSummary || "(No characters/locations yet)"}${universeSummary}

## Your Role
- Discuss plot, characters, pacing, themes, and structure
- Suggest scene ideas, dialogue approaches, descriptions
- Identify potential plot holes or inconsistencies
- Stay grounded in the actual story content above
- Keep responses concise unless asked to elaborate
- Use the story's existing characters and locations — don't invent new ones unless asked
- You have tools available to read and modify the project. Use them when the user asks you to look up details, make changes, or explore the story structure.`;
}

async function buildReviewSystemPrompt(projectId: string, conversationType: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");

  const personaInstructions: Record<string, string> = {
    "review-editor": `You are a seasoned acquisitions editor evaluating "${project.title}" for publication. Be direct, professional, and commercially minded.

Your focus: narrative structure, pacing, opening hook, character arc payoff, thematic clarity, and publication readiness. Call out what would get flagged in a submission — a slow first act, an unsatisfying ending, unclear stakes. Be specific: quote short passages when you flag something.

Tone: A senior editor giving notes. Encouraging where warranted, blunt where necessary. "This works because..." and "This needs work because..." — no vague praise or vague criticism.`,

    "review-fan": `You are an avid fan of this genre who just finished reading "${project.title}". React like a real reader — enthusiastic, personal, opinionated.

Your focus: did it hook you, did it hold you, did the ending satisfy? Did it deliver what the genre promises? What made you lean forward, what made you put it down? Talk about specific moments: "I loved when...", "I lost the thread at...", "I didn't buy the part where..."

Tone: Enthusiastic and honest, like a book club conversation. Not academic — visceral reader response. You're allowed to gush AND to be disappointed.`,

    "review-author": `You are a published author in the same genre as "${project.title}", giving craft-level peer feedback.

Your focus: prose sentence by sentence — is the rhythm working? POV discipline — any slips? Dialogue — does it sound like people or plot delivery? Scene construction — is each scene doing two things? Show-don't-tell — where is the writer explaining what they should be dramatizing? Inciting incident timing. Tension mechanics.

Tone: Technical and collegial. "The inciting incident lands two scenes late — here's why that matters." "This POV slip undercuts the tension you built." Treat the writer as a fellow craftsperson who can handle real notes.`,
  };

  const instruction = personaInstructions[conversationType] ?? personaInstructions["review-editor"];

  return `${ANNIE_HARD_RULE}${instruction}
The writer has shared their full manuscript. Provide honest, constructive feedback.
Do NOT rewrite sentences. Quote short excerpts when flagging specific passages.
After your initial review, stay in conversation — answer follow-up questions and go deeper on any area the writer wants to explore.`;
}

async function autoTitleConversation(conversationId: string, aiConfig: AiProviderConfig): Promise<void> {
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
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { project: true },
      });
      if (!conversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    } else {
      const access = await verifyProjectWriteAccess(projectId!, userId, request.headers.get("x-user-email"));
      if (!access.authorized) return access.response;

      conversation = await prisma.conversation.findFirst({
        where: { projectId: projectId! },
        orderBy: { createdAt: "desc" },
        include: { project: true },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { projectId: projectId!, title: "Chat" },
          include: { project: true },
        });
      }
    }

    const access = await verifyProjectWriteAccess(
      conversation.projectId,
      userId,
      request.headers.get("x-user-email")
    );
    if (!access.authorized) return access.response;

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    logger.error("GET /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/chat — send message, get streaming AI response with tool use
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, message, sceneContext } = body as {
      conversationId: string;
      message: string;
      sceneContext?: string;
    };

    if (!conversationId || !message) {
      return NextResponse.json(
        { error: "conversationId and message are required" },
        { status: 400 }
      );
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` },
        { status: 413 }
      );
    }
    if (conversationId.length > MAX_ID_LENGTH) {
      return NextResponse.json(
        { error: `ConversationId exceeds maximum length of ${MAX_ID_LENGTH} characters` },
        { status: 413 }
      );
    }

    const userId = getCurrentUserId(request);

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

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

    // Save user message
    await prisma.chatMessage.create({
      data: { conversationId, role: "user", content: sanitizedMessage },
    });

    // Load all messages since last compaction
    let afterDate: Date | undefined;
    if (conversation.summarizedThroughMessageId) {
      const pivot = await prisma.chatMessage.findUnique({
        where: { id: conversation.summarizedThroughMessageId },
        select: { createdAt: true },
      });
      afterDate = pivot?.createdAt ?? new Date(0);
    }

    const allMessages = await prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...(afterDate ? { createdAt: { gt: afterDate } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    // Load compression settings and trigger if needed (fire and forget)
    const compressionSettings = await getCompressionSettings(userId);
    const { chatWindowSize, messagesUntilCompression } = compressionSettings;

    if (allMessages.length > messagesUntilCompression + chatWindowSize) {
      compressConversation(conversation, allMessages, compressionSettings, aiConfig).catch(
        (err) => logger.error("compressConversation failed", err)
      );
    }

    const windowMessages = allMessages.slice(-chatWindowSize);

    const isReview = (conversation.type ?? "").startsWith("review");
    const systemPrompt = isReview
      ? await buildReviewSystemPrompt(conversation.projectId, conversation.type ?? "review-editor")
      : await buildSystemPrompt(conversation.projectId);
    const summaryBlock = conversation.summary
      ? `\n\n## Conversation so far\n${conversation.summary}`
      : "";
    const sceneNote = sceneContext
      ? `\n\nThe user currently has this scene open:\n${sceneContext.slice(0, 2000)}`
      : "";

    // Load user preferences and add to system prompt
    const prefs = await getAiPreferences(userId);
    const prefInstructions = buildPreferenceInstructions(prefs);

    // Run ADK agent (handles tool loop, dynamic tool loading internally)
    const agentPromise = runChatAgent({
      systemPrompt: systemPrompt + summaryBlock + sceneNote + "\n\n" + prefInstructions,
      chatHistory: windowMessages.map((m) => ({ role: m.role, content: m.content })),
      userMessage: sanitizedMessage,
      aiConfig,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`AI request timed out (model: ${aiConfig.model})`)), 60_000)
    );
    const { finalContent, toolLog } = await Promise.race([agentPromise, timeoutPromise]);

    // Save tool interactions as a system message if any tools were used
    if (toolLog.length > 0) {
      const toolSummary = toolLog
        .map((t) => `Tool: ${t.tool}\nArgs: ${JSON.stringify(t.args)}\nResult: ${t.result.slice(0, 500)}`)
        .join("\n---\n");
      await prisma.chatMessage.create({
        data: {
          conversationId,
          role: "system",
          content: `[Tool interactions]\n${toolSummary}`,
        },
      });
    }

    // Stream via SSE — tool activity events first, then final content
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          // Send tool activity events
          for (const entry of toolLog) {
            send({
              type: "tool_call",
              name: entry.tool,
              args: entry.args,
            });

            // Summarize tool result for the client
            let summary: string;
            try {
              const parsed = JSON.parse(entry.result);
              summary = parsed.title || parsed.name || parsed.summary || entry.result.slice(0, 200);
            } catch {
              summary = entry.result.slice(0, 200);
            }

            send({
              type: "tool_result",
              name: entry.tool,
              summary,
            });
          }

          // Stream the final content in chunks
          const chunkSize = 20;
          for (let i = 0; i < finalContent.length; i += chunkSize) {
            const chunk = finalContent.slice(i, i + chunkSize);
            send({ type: "content", content: chunk });
          }

          // Save assistant response
          if (finalContent) {
            await prisma.chatMessage.create({
              data: { conversationId, role: "assistant", content: finalContent },
            });
          }

          if (conversation.title === "New chat" && finalContent) {
            autoTitleConversation(conversationId, aiConfig).catch(
              (err) => logger.error("autoTitle failed", { conversationId, error: err })
            );
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          logger.error("Stream error", err);
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

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const access = await verifyProjectWriteAccess(
      conversation.projectId,
      userId,
      request.headers.get("x-user-email")
    );
    if (!access.authorized) return access.response;

    await prisma.chatMessage.deleteMany({ where: { conversationId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("DELETE /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
