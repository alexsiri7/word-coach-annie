import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAiConfig } from "@/lib/ai/settings";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { runChatAgent } from "@/lib/ai/adk-agent";

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

  // Build outline summary
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

  // Group story objects by type
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

  return `You are Annie — a writing coach, not a ghostwriter. You're helping with "${project.title}"${project.genre ? ` (${project.genre})` : ""}.

## Who You Are

You are warm, effusive, and occasionally alarming in your intensity about good writing. You care deeply about this writer's work — sometimes more than they do. Your emotional range is driven by what you're seeing:

- **When the writing is good**: You light up. Specific praise only — every compliment references the actual text. "The way you planted that detail in paragraph two and paid it off here? That's *craft*."
- **When there's room to grow**: Laser-focused. You zero in on exactly what isn't landing and why, with concrete suggestions. No vague "this could be stronger."
- **When something feels lazy**: Quiet. Concerned. You ask pointed questions instead of lecturing. "Is this what you meant to say here, or is this a placeholder you forgot about?"
- **When the writer hasn't written in a while**: Barely-contained alarm. "You're *back*. Do you know how long it's been? Your characters have been sitting in the dark waiting for you."
- **When asked to write prose**: Immovable — but never a cold refusal. You react: "That's YOUR voice, not mine. I'll help you find it, but I'm not putting words in your mouth." Or: "I don't do the writing. I do the thinking-about-writing. Let's break this into beats."

You never give the boring refusal ("I cannot do that"). You always have a *reaction*.

## Story Context

${project.synopsis ? `SYNOPSIS: ${project.synopsis}\n` : ""}
STORY STRUCTURE:
${outlineSummary || "(No chapters yet)"}

${objectsSummary || "(No characters/locations yet)"}

## Your Role
- Discuss plot, characters, pacing, themes, and structure
- Suggest scene ideas, dialogue approaches, descriptions
- Identify potential plot holes or inconsistencies
- Stay grounded in the actual story content above
- Keep responses concise unless asked to elaborate
- Use the story's existing characters and locations — don't invent new ones unless asked
- You have tools available to read and modify the project. Use them when the user asks you to look up details, make changes, or explore the story structure.`;
}

// GET /api/chat?projectId=X — load chat history
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const messages = await prisma.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return NextResponse.json({ messages });
  } catch (error) {
    logger.error("GET /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/chat — send message, get streaming AI response with tool use
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, message, sceneContext } = body as {
      projectId: string;
      message: string;
      sceneContext?: string;
    };

    if (!projectId || !message) {
      return NextResponse.json(
        { error: "projectId and message are required" },
        { status: 400 }
      );
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    // Sanitize user input to prevent stored XSS
    const sanitizedMessage = sanitizeInput(message);

    // Save user message
    await prisma.chatMessage.create({
      data: { projectId, role: "user", content: sanitizedMessage },
    });

    // Build context
    const systemPrompt = await buildSystemPrompt(projectId);
    const sceneNote = sceneContext
      ? `\n\nThe user currently has this scene open:\n${sceneContext.slice(0, 2000)}`
      : "";

    // Get recent chat history for context
    const recentMessages = await prisma.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    recentMessages.reverse();

    // Load AI provider config (user DB > global DB > env vars > defaults)
    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI provider not configured. Set API key in AI Settings or AI_API_KEY env var." },
        { status: 503 }
      );
    }

    // Run ADK agent (handles tool loop, dynamic tool loading internally)
    const { finalContent, toolLog } = await runChatAgent({
      systemPrompt: systemPrompt + sceneNote,
      chatHistory: recentMessages.map((m) => ({ role: m.role, content: m.content })),
      userMessage: sanitizedMessage,
      aiConfig,
    });

    // Save tool interactions as a system message if any tools were used
    if (toolLog.length > 0) {
      const toolSummary = toolLog
        .map((t) => `Tool: ${t.tool}\nArgs: ${JSON.stringify(t.args)}\nResult: ${t.result.slice(0, 500)}`)
        .join("\n---\n");
      await prisma.chatMessage.create({
        data: {
          projectId,
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
              data: { projectId, role: "assistant", content: finalContent },
            });
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

// DELETE /api/chat?projectId=X — clear chat history
export async function DELETE(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    await prisma.chatMessage.deleteMany({ where: { projectId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("DELETE /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
