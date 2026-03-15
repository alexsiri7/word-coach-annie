import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import {
  getCoreTools,
  getToolDefinitions,
  type ToolCategory,
  type OpenAIToolDefinition,
} from "@/lib/ai/tool-registry";
import { executeTool } from "@/lib/ai/tool-executor";
import { getAiConfig } from "@/lib/ai/settings";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";

const MAX_TOOL_ITERATIONS = 10;

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
- Use the story's existing characters and locations — don't invent new ones unless asked
- You have tools available to read and modify the project. Use them when the user asks you to look up details, make changes, or explore the story structure.`;
}

/** Build the current tool list from loaded categories */
function buildToolList(loadedCategories: Set<ToolCategory>): OpenAIToolDefinition[] {
  const extraCategories = Array.from(loadedCategories).filter((c) => c !== "core");
  return [...getCoreTools(), ...getToolDefinitions(extraCategories)];
}

/** Handle the load_toolset meta-tool: add the requested category's tools */
function handleLoadToolset(
  args: Record<string, unknown>,
  loadedCategories: Set<ToolCategory>,
): string {
  const category = args.category as ToolCategory;
  const validCategories: ToolCategory[] = [
    "structure", "characters", "world_building", "export", "admin", "skills",
  ];
  if (!validCategories.includes(category)) {
    return JSON.stringify({
      error: true,
      message: `Invalid category: ${category}. Valid: ${validCategories.join(", ")}`,
    });
  }
  loadedCategories.add(category);
  const newTools = getToolDefinitions([category]);
  return JSON.stringify({
    loaded: category,
    toolCount: newTools.length,
    tools: newTools.map((t) => t.function.name),
  });
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

    const chatHistory: OpenAI.ChatCompletionMessageParam[] = recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Track loaded tool categories and tool interaction log
    const loadedCategories = new Set<ToolCategory>(["core"]);
    const toolLog: { tool: string; args: Record<string, unknown>; result: string }[] = [];

    // Load AI provider config (DB settings > env vars > defaults)
    const aiConfig = await getAiConfig();
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI provider not configured. Set API key in AI Settings or AI_API_KEY env var." },
        { status: 503 }
      );
    }
    const openai = new OpenAI({
      baseURL: aiConfig.baseUrl || undefined,
      apiKey: aiConfig.apiKey,
    });

    // Build messages array for the LLM
    const llmMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt + sceneNote },
      ...chatHistory,
    ];

    // Tool use loop: call LLM non-streaming, execute tools, repeat
    let finalContent = "";
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const tools = buildToolList(loadedCategories);

      const response = await openai.chat.completions.create({
        model: aiConfig.model,
        messages: llmMessages,
        tools,
      });

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;

      // If no tool calls, we have the final response
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalContent = assistantMessage.content || "";
        break;
      }

      // Add assistant message with tool calls to conversation
      llmMessages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") continue;
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);

        let result: string;
        if (fnName === "load_toolset") {
          result = handleLoadToolset(fnArgs, loadedCategories);
        } else {
          result = await executeTool(fnName, fnArgs);
        }

        toolLog.push({ tool: fnName, args: fnArgs, result });

        // Add tool result to messages
        llmMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // If finish_reason is "stop" despite having tool_calls, break
      if (choice.finish_reason === "stop") {
        finalContent = assistantMessage.content || "";
        break;
      }
    }

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

    await prisma.chatMessage.deleteMany({ where: { projectId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("DELETE /api/chat error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
