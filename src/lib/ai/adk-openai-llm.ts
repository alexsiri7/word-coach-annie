/**
 * OpenAI-compatible LLM provider for Google ADK.
 *
 * Translates between ADK's Gemini-native Content/Part types and the OpenAI
 * chat completion API format, allowing ADK agents to use any OpenAI-compatible
 * endpoint (OpenAI, Requesty, vLLM, Ollama, etc.).
 */
import {
  BaseLlm,
  type BaseLlmConnection,
  type LlmRequest,
  type LlmResponse,
} from "@google/adk";
import type {
  Content,
  FunctionCall,
  FunctionResponse,
  Part,
  Tool,
} from "@google/genai";
import OpenAI from "openai";

// ─── OpenAI ↔ ADK type translations ─────────────────────────────────────────

/** Convert ADK Content[] messages to OpenAI chat completion messages. */
function contentsToOpenAI(
  contents: Content[],
): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  for (const content of contents) {
    const role = content.role === "model" ? "assistant" : "user";
    const parts = content.parts ?? [];

    // Check if this content has function calls (assistant tool_calls)
    const functionCalls = parts.filter(
      (p): p is Part & { functionCall: FunctionCall } => !!p.functionCall,
    );
    const functionResponses = parts.filter(
      (p): p is Part & { functionResponse: FunctionResponse } =>
        !!p.functionResponse,
    );
    const textParts = parts.filter((p) => p.text != null);

    if (functionCalls.length > 0) {
      // Assistant message with tool calls
      const toolCalls: OpenAI.ChatCompletionMessageToolCall[] =
        functionCalls.map((p, i) => ({
          id: p.functionCall.id ?? `call_${i}`,
          type: "function" as const,
          function: {
            name: p.functionCall.name ?? "",
            arguments: JSON.stringify(p.functionCall.args ?? {}),
          },
        }));

      messages.push({
        role: "assistant",
        content: textParts.map((p) => p.text).join("") || null,
        tool_calls: toolCalls,
      });
    } else if (functionResponses.length > 0) {
      // Tool result messages
      for (const p of functionResponses) {
        messages.push({
          role: "tool",
          tool_call_id: p.functionResponse.id ?? "",
          content: JSON.stringify(p.functionResponse.response ?? {}),
        });
      }
    } else {
      // Plain text message
      const text = textParts.map((p) => p.text).join("");
      messages.push({ role, content: text });
    }
  }

  return messages;
}

/** Convert ADK system instruction to OpenAI system message. */
function systemInstructionToOpenAI(
  instruction: Content | string | undefined,
): OpenAI.ChatCompletionSystemMessageParam | null {
  if (!instruction) return null;
  if (typeof instruction === "string") {
    return { role: "system", content: instruction };
  }
  const text = (instruction.parts ?? [])
    .filter((p) => p.text != null)
    .map((p) => p.text)
    .join("");
  return text ? { role: "system", content: text } : null;
}

/** Convert ADK Tool[] (with functionDeclarations) to OpenAI tools format. */
function toolsToOpenAI(
  tools?: Tool[],
): OpenAI.ChatCompletionTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  const result: OpenAI.ChatCompletionTool[] = [];
  for (const tool of tools) {
    if (!tool.functionDeclarations) continue;
    for (const fn of tool.functionDeclarations) {
      result.push({
        type: "function",
        function: {
          name: fn.name ?? "",
          description: fn.description ?? "",
          parameters: (fn.parametersJsonSchema ??
            fn.parameters ??
            {}) as Record<string, unknown>,
        },
      });
    }
  }
  return result.length > 0 ? result : undefined;
}

/** Convert an OpenAI chat completion response to an ADK LlmResponse. */
function openAIResponseToLlmResponse(
  response: OpenAI.ChatCompletion,
): LlmResponse {
  const choice = response.choices[0];
  if (!choice) {
    return { errorCode: "NO_CHOICE", errorMessage: "No choices in response" };
  }

  const message = choice.message;
  const parts: Part[] = [];

  // Text content
  if (message.content) {
    parts.push({ text: message.content });
  }

  // Tool calls → functionCall parts
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      if (tc.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        // If parsing fails, use empty args
      }
      parts.push({
        functionCall: {
          id: tc.id,
          name: tc.function.name,
          args,
        },
      });
    }
  }

  const content: Content = {
    role: "model",
    parts,
  };

  return {
    content,
    turnComplete: choice.finish_reason === "stop",
    usageMetadata: response.usage
      ? {
          promptTokenCount: response.usage.prompt_tokens,
          candidatesTokenCount: response.usage.completion_tokens,
          totalTokenCount: response.usage.total_tokens,
        }
      : undefined,
  };
}

// ─── OpenAI-compatible LLM provider ─────────────────────────────────────────

export interface OpenAICompatibleLlmConfig {
  /** Model name (e.g. "gpt-4o", "google/gemini-2.0-flash-001") */
  model: string;
  /** API key for the provider */
  apiKey: string;
  /** Base URL for the OpenAI-compatible endpoint */
  baseUrl?: string;
}

/**
 * ADK-compatible LLM that routes to any OpenAI-compatible endpoint.
 *
 * This bridges the existing AI provider abstraction (settings.ts) with ADK's
 * model system, allowing ADK agents to use the same configurable endpoints.
 */
export class OpenAICompatibleLlm extends BaseLlm {
  private client: OpenAI;
  private apiKey: string;
  private baseUrl?: string;

  /** Match any model string — routing is handled by the provider, not ADK. */
  static override readonly supportedModels: Array<string | RegExp> = [
    /openai\/.*/,
  ];

  constructor(config: OpenAICompatibleLlmConfig) {
    super({ model: config.model });
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined,
    });
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream?: boolean,
  ): AsyncGenerator<LlmResponse, void> {
    // Build OpenAI messages from ADK request
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    // System instruction
    const systemInstruction = llmRequest.config?.systemInstruction;
    const systemMsg = systemInstructionToOpenAI(
      systemInstruction as Content | string | undefined,
    );
    if (systemMsg) {
      messages.push(systemMsg);
    }

    // Conversation contents
    messages.push(...contentsToOpenAI(llmRequest.contents));

    // Tools
    const tools = toolsToOpenAI(
      llmRequest.config?.tools as Tool[] | undefined,
    );

    // Make the API call (non-streaming for now — streaming can be added later)
    const response = await this.client.chat.completions.create({
      model: llmRequest.model ?? this.model,
      messages,
      tools,
      temperature: llmRequest.config?.temperature ?? undefined,
      top_p: llmRequest.config?.topP ?? undefined,
      max_tokens:
        (llmRequest.config as Record<string, unknown>)?.maxOutputTokens as
          | number
          | undefined,
    });

    yield openAIResponseToLlmResponse(response);
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error(
      "OpenAICompatibleLlm does not support live connections. Use generateContentAsync instead.",
    );
  }
}

/**
 * Create an OpenAICompatibleLlm from the existing AI provider settings.
 * This is the bridge between settings.ts config and ADK's model system.
 */
export function createOpenAILlmFromConfig(config: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): OpenAICompatibleLlm {
  return new OpenAICompatibleLlm({
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
}
