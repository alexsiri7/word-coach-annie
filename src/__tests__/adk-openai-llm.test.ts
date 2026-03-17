import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmRequest } from "@google/adk";
import type { Content, LiveConnectConfig } from "@google/genai";

// Shared mock for the create function
const createMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: createMock } },
    })),
  };
});

import {
  OpenAICompatibleLlm,
  createOpenAILlmFromConfig,
} from "@/lib/ai/adk-openai-llm";

function makeLlmRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    contents: [],
    liveConnectConfig: {} as LiveConnectConfig,
    toolsDict: {},
    ...overrides,
  };
}

describe("OpenAICompatibleLlm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs with config and passes through to OpenAI client", () => {
    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
      baseUrl: "https://api.example.com/v1",
    });

    expect(llm.model).toBe("gpt-4o");
  });

  it("converts simple text content and returns LlmResponse", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: { role: "assistant", content: "Hello!", tool_calls: null },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
    });

    const request = makeLlmRequest({
      contents: [{ role: "user", parts: [{ text: "Hi there" }] }],
      config: {
        systemInstruction: { role: "user", parts: [{ text: "Be helpful" }] },
      },
    });

    const responses: unknown[] = [];
    for await (const resp of llm.generateContentAsync(request)) {
      responses.push(resp);
    }

    expect(responses).toHaveLength(1);
    const resp = responses[0] as {
      content: Content;
      turnComplete: boolean;
      usageMetadata: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };
    expect(resp.content.role).toBe("model");
    expect(resp.content.parts?.[0]?.text).toBe("Hello!");
    expect(resp.turnComplete).toBe(true);
    expect(resp.usageMetadata?.promptTokenCount).toBe(10);

    // Verify OpenAI was called with correct messages
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Be helpful" },
          { role: "user", content: "Hi there" },
        ],
      }),
    );
  });

  it("converts function calls from OpenAI response to ADK format", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_abc123",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"New York"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 20, total_tokens: 35 },
    });

    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
    });

    const request = makeLlmRequest({
      contents: [
        { role: "user", parts: [{ text: "What's the weather in NYC?" }] },
      ],
    });

    const responses: unknown[] = [];
    for await (const resp of llm.generateContentAsync(request)) {
      responses.push(resp);
    }

    expect(responses).toHaveLength(1);
    const resp = responses[0] as { content: Content };
    const parts = resp.content.parts ?? [];
    expect(parts).toHaveLength(1);
    expect(parts[0].functionCall).toEqual({
      id: "call_abc123",
      name: "get_weather",
      args: { city: "New York" },
    });
  });

  it("converts ADK function responses to OpenAI tool messages", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: "assistant",
            content: "It's sunny in NYC!",
            tool_calls: null,
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
    });

    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
    });

    const request = makeLlmRequest({
      contents: [
        { role: "user", parts: [{ text: "What's the weather?" }] },
        {
          role: "model",
          parts: [
            {
              functionCall: {
                id: "call_abc123",
                name: "get_weather",
                args: { city: "New York" },
              },
            },
          ],
        },
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: "call_abc123",
                name: "get_weather",
                response: { temperature: 25, condition: "sunny" },
              },
            },
          ],
        },
      ],
    });

    const responses: unknown[] = [];
    for await (const resp of llm.generateContentAsync(request)) {
      responses.push(resp);
    }

    // Verify the messages were correctly translated
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "What's the weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_abc123",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"New York"}',
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_abc123",
            content: '{"temperature":25,"condition":"sunny"}',
          },
        ],
      }),
    );
  });

  it("converts ADK tool declarations to OpenAI tools format", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: { role: "assistant", content: "OK", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
    });

    const request = makeLlmRequest({
      contents: [{ role: "user", parts: [{ text: "test" }] }],
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: "my_tool",
                description: "A test tool",
                parametersJsonSchema: {
                  type: "object",
                  properties: { q: { type: "string" } },
                },
              },
            ],
          },
        ],
      },
    });

    for await (const _resp of llm.generateContentAsync(request)) {
      // consume
    }

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            type: "function",
            function: {
              name: "my_tool",
              description: "A test tool",
              parameters: {
                type: "object",
                properties: { q: { type: "string" } },
              },
            },
          },
        ],
      }),
    );
  });

  it("handles empty response choices gracefully", async () => {
    createMock.mockResolvedValueOnce({ choices: [] });

    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
    });

    const request = makeLlmRequest({
      contents: [{ role: "user", parts: [{ text: "test" }] }],
    });

    const responses: unknown[] = [];
    for await (const resp of llm.generateContentAsync(request)) {
      responses.push(resp);
    }

    expect(responses).toHaveLength(1);
    const resp = responses[0] as { errorCode: string };
    expect(resp.errorCode).toBe("NO_CHOICE");
  });

  it("throws on connect() since live connections are not supported", async () => {
    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await expect(llm.connect(makeLlmRequest())).rejects.toThrow(
      "does not support live connections",
    );
  });

  it("passes string system instruction correctly", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: { role: "assistant", content: "Hi", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const llm = new OpenAICompatibleLlm({
      model: "gpt-4o",
      apiKey: "test-key",
    });

    const request = makeLlmRequest({
      contents: [{ role: "user", parts: [{ text: "test" }] }],
      config: {
        systemInstruction: "You are a helpful assistant",
      },
    });

    for await (const _resp of llm.generateContentAsync(request)) {
      // consume
    }

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "test" },
        ],
      }),
    );
  });
});

describe("createOpenAILlmFromConfig", () => {
  it("creates an OpenAICompatibleLlm from settings config", () => {
    const llm = createOpenAILlmFromConfig({
      baseUrl: "https://router.requesty.ai/v1",
      apiKey: "rq-test-key",
      model: "google/gemini-2.0-flash-001",
    });

    expect(llm).toBeInstanceOf(OpenAICompatibleLlm);
    expect(llm.model).toBe("google/gemini-2.0-flash-001");
  });
});
