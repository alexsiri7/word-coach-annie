import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";

const openai = new OpenAI({
  baseURL: "https://router.requesty.ai/v1",
  apiKey: process.env.REQUESTY_API_KEY || "",
});

const MODEL = process.env.REQUESTY_MODEL || "google/gemini-2.0-flash-001";

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

  return `You are a thoughtful writing assistant helping with "${project.title}"${project.genre ? ` (${project.genre})` : ""}.

${project.synopsis ? `SYNOPSIS: ${project.synopsis}\n` : ""}
STORY STRUCTURE:
${outlineSummary || "(No chapters yet)"}

${objectsSummary || "(No characters/locations yet)"}

Your role:
- Discuss plot, characters, pacing, themes, and structure
- Suggest scene ideas, dialogue approaches, descriptions
- Identify potential plot holes or inconsistencies
- Be encouraging but honest — like a good writing partner
- Stay grounded in the actual story content above
- Keep responses concise unless asked to elaborate
- Use the story's existing characters and locations — don't invent new ones unless asked`;
}

// GET /api/chat?projectId=X — load chat history
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("GET /api/chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/chat — send message, get streaming AI response
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

    // Save user message
    await prisma.chatMessage.create({
      data: { projectId, role: "user", content: message },
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

    const chatHistory: OpenAI.ChatCompletionMessageParam[] = recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Stream response
    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt + sceneNote },
        ...chatHistory,
      ],
      stream: true,
    });

    // Create a ReadableStream that sends SSE
    const encoder = new TextEncoder();
    let fullResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }
          }

          // Save assistant response
          await prisma.chatMessage.create({
            data: { projectId, role: "assistant", content: fullResponse },
          });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream error" })}\n\n`
            )
          );
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
    console.error("POST /api/chat error:", error);
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

    await prisma.chatMessage.deleteMany({ where: { projectId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
