/**
 * ADK agent runner — replaces the manual tool loop with ADK's native agent execution.
 *
 * Creates an LlmAgent with DynamicToolset (for load_toolset pattern) and
 * OpenAICompatibleLlm (for provider flexibility). Returns the final content
 * and tool log in the same format as the previous manual loop.
 */
import {
  LlmAgent,
  InMemoryRunner,
  createEvent,
  createEventActions,
  getFunctionCalls,
  getFunctionResponses,
  stringifyContent,
} from "@google/adk";
import type { Content, GenerateContentConfig } from "@google/genai";
import { DynamicToolset } from "./adk-tools";
import type { ToolCategory } from "./adk-tools";
import { OpenAICompatibleLlm } from "./adk-openai-llm";
import { SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "@/lib/telemetry";

const AGENT_NAME = "writing_assistant";

export interface ChatAgentResult {
  finalContent: string;
  toolLog: { tool: string; args: Record<string, unknown>; result: string }[];
}

/**
 * Run the writing assistant agent using ADK's native agent loop.
 * Manages the tool loop internally, including dynamic tool loading.
 */
export async function runChatAgent(params: {
  systemPrompt: string;
  chatHistory: { role: string; content: string }[];
  userMessage: string;
  aiConfig: { baseUrl: string; apiKey: string; model: string };
}): Promise<ChatAgentResult> {
  const tracer = getTracer();

  return tracer.startActiveSpan("agent.run", async (span) => {
    try {
      span.setAttribute("agent.name", AGENT_NAME);
      span.setAttribute("agent.model", params.aiConfig.model);
      span.setAttribute("agent.history_length", params.chatHistory.length);
      span.setAttribute("agent.user_message_length", params.userMessage.length);

      const llm = new OpenAICompatibleLlm({
        model: params.aiConfig.model,
        apiKey: params.aiConfig.apiKey,
        baseUrl: params.aiConfig.baseUrl,
      });

      const toolset = new DynamicToolset();

      const agent = new LlmAgent({
        name: AGENT_NAME,
        model: llm,
        instruction: params.systemPrompt,
        tools: [toolset],
        afterToolCallback: async ({ tool, args }) => {
          // When load_toolset is called, expand the DynamicToolset so subsequent
          // LLM turns see the newly loaded category's tools.
          if (tool.name === "load_toolset") {
            const { category } = args as { category: string };
            toolset.loadCategory(category as ToolCategory);
          }
          return undefined;
        },
      });

      const runner = new InMemoryRunner({
        agent,
        appName: "word-coach-annie",
      });

      // Create session and populate with chat history
      const session = await runner.sessionService.createSession({
        appName: "word-coach-annie",
        userId: "default",
      });

      for (const msg of params.chatHistory) {
        if (msg.role === "system") continue; // Skip tool log system messages
        await runner.sessionService.appendEvent({
          session,
          event: createEvent({
            author: msg.role === "assistant" ? AGENT_NAME : "user",
            content: {
              role: msg.role === "assistant" ? "model" : "user",
              parts: [{ text: msg.content }],
            },
            actions: createEventActions(),
            invocationId: "history",
          }),
        });
      }

      // Run the agent with the new user message
      const newMessage: Content = {
        role: "user",
        parts: [{ text: params.userMessage }],
      };

      const toolLog: ChatAgentResult["toolLog"] = [];
      let finalContent = "";
      const pendingCalls = new Map<
        string,
        { name: string; args: Record<string, unknown> }
      >();

      for await (const event of runner.runAsync({
        userId: "default",
        sessionId: session.id,
        newMessage,
      })) {
        // Collect tool calls
        for (const call of getFunctionCalls(event)) {
          if (call.id && call.name) {
            pendingCalls.set(call.id, {
              name: call.name,
              args: (call.args ?? {}) as Record<string, unknown>,
            });
          }
        }

        // Match tool results to their calls
        for (const resp of getFunctionResponses(event)) {
          const callInfo = pendingCalls.get(resp.id ?? "");
          if (callInfo) {
            toolLog.push({
              tool: callInfo.name,
              args: callInfo.args,
              result: JSON.stringify(resp.response ?? {}),
            });
            pendingCalls.delete(resp.id ?? "");
          }
        }

        // Capture final text content from the agent (not tool call/result events)
        if (
          event.author === AGENT_NAME &&
          getFunctionCalls(event).length === 0 &&
          getFunctionResponses(event).length === 0
        ) {
          const text = stringifyContent(event);
          if (text) finalContent = text;
        }
      }

      // Record summary attributes
      span.setAttribute("agent.tool_calls_total", toolLog.length);
      span.setAttribute("agent.response_length", finalContent.length);
      span.setStatus({ code: SpanStatusCode.OK });

      return { finalContent, toolLog };
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Run a simple single-turn completion through the ADK LLM shim.
 * Used by routes that don't need tool use or multi-turn conversation.
 * Routes through OpenAICompatibleLlm so all AI calls share one code path.
 */
export async function runSimpleCompletion(params: {
  systemPrompt?: string;
  userMessage: string;
  aiConfig: { baseUrl: string; apiKey: string; model: string };
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const llm = new OpenAICompatibleLlm({
    model: params.aiConfig.model,
    apiKey: params.aiConfig.apiKey,
    baseUrl: params.aiConfig.baseUrl,
  });

  const contents: Content[] = [
    { role: "user", parts: [{ text: params.userMessage }] },
  ];

  const config: GenerateContentConfig = {
    ...(params.systemPrompt ? { systemInstruction: params.systemPrompt } : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
    ...(params.maxTokens !== undefined
      ? { maxOutputTokens: params.maxTokens }
      : {}),
  };

  // LlmRequest is not exported from @google/adk — construct compatible object
  const llmRequest = {
    contents,
    config,
    liveConnectConfig: {},
    toolsDict: {},
  } as Parameters<typeof llm.generateContentAsync>[0];

  let result = "";
  for await (const response of llm.generateContentAsync(llmRequest)) {
    if (response.content?.parts) {
      const text = response.content.parts
        .filter((p) => p.text != null)
        .map((p) => p.text)
        .join("");
      if (text) result = text;
    }
  }
  return result.trim();
}
