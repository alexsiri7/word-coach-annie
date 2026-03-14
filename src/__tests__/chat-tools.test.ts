import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so they're available in vi.mock factories
const { mockCreate, mockPrisma, mockExecuteTool, mockGetAiConfig } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockPrisma: {
    project: { findUnique: vi.fn() },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockExecuteTool: vi.fn(),
  mockGetAiConfig: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/ai/tool-executor", () => ({
  executeTool: (...args: unknown[]) => mockExecuteTool(...args),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: () => mockGetAiConfig(),
}));

// Import after mocks
import { POST } from "@/app/api/chat/route";
import { getCoreTools, getToolDefinitions } from "@/lib/ai/tool-registry";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

async function readSSE(response: Response): Promise<string[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => {
      const data = line.replace("data: ", "");
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    });
}

const fakeProject = {
  id: "proj-1",
  title: "Test Novel",
  genre: "Fantasy",
  synopsis: "A test story",
  structureNodes: [],
  storyObjects: [],
};

beforeEach(() => {
  vi.clearAllMocks();

  mockGetAiConfig.mockResolvedValue({
    baseUrl: "https://test.example.com/v1",
    apiKey: "test-key",
    model: "test-model",
  });
  mockPrisma.project.findUnique.mockResolvedValue(fakeProject);
  mockPrisma.chatMessage.findMany.mockResolvedValue([
    { role: "user", content: "Hello", createdAt: new Date() },
  ]);
  mockPrisma.chatMessage.create.mockResolvedValue({});
});

describe("Chat route with tool use", () => {
  it("includes tool definitions in LLM request", async () => {
    // LLM responds with no tool calls
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "Hello! How can I help?", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Hi" });
    await POST(req as any);

    // Verify tools were passed to the LLM
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(Array.isArray(callArgs.tools)).toBe(true);
    expect(callArgs.tools.length).toBeGreaterThanOrEqual(8);

    // Should include core tools
    const toolNames = callArgs.tools.map((t: any) => t.function.name);
    expect(toolNames).toContain("list_projects");
    expect(toolNames).toContain("get_outline");
    expect(toolNames).toContain("load_toolset");
  });

  it("executes tool calls and feeds results back to LLM", async () => {
    // First call: LLM wants to call a tool
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "get_outline",
                  arguments: JSON.stringify({ projectId: "proj-1" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    // Mock the tool execution
    mockExecuteTool.mockResolvedValueOnce(
      JSON.stringify({ chapters: [{ title: "Chapter 1" }] })
    );

    // Second call: LLM responds with text
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "Based on the outline, Chapter 1 looks great!", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Show me the outline" });
    const response = await POST(req as any);
    const chunks = await readSSE(response);

    // Tool was executed
    expect(mockExecuteTool).toHaveBeenCalledWith("get_outline", { projectId: "proj-1" });

    // LLM was called twice (initial + after tool result)
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Second call should include tool result
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages.find((m: any) => m.role === "tool");
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.tool_call_id).toBe("call-1");

    // Final response was streamed
    const allContent = chunks
      .filter((c: any) => c.content)
      .map((c: any) => c.content)
      .join("");
    expect(allContent).toContain("Chapter 1 looks great");
  });

  it("handles load_toolset — adds new tools to available set", async () => {
    // First call: LLM calls load_toolset
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-lt",
                type: "function",
                function: {
                  name: "load_toolset",
                  arguments: JSON.stringify({ category: "structure" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    // Second call: LLM uses a structure tool (create_node)
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-cn",
                type: "function",
                function: {
                  name: "create_node",
                  arguments: JSON.stringify({
                    projectId: "proj-1",
                    type: "CHAPTER",
                    title: "New Chapter",
                  }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    mockExecuteTool.mockResolvedValueOnce(JSON.stringify({ id: "node-1", title: "New Chapter" }));

    // Third call: final response
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "I created a new chapter for you.", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Add a new chapter" });
    await POST(req as any);

    // LLM was called 3 times
    expect(mockCreate).toHaveBeenCalledTimes(3);

    // Second call should have structure tools available
    const secondCallTools = mockCreate.mock.calls[1][0].tools;
    const secondToolNames = secondCallTools.map((t: any) => t.function.name);
    expect(secondToolNames).toContain("create_node");
    expect(secondToolNames).toContain("update_node");

    // executeTool was called for create_node (not for load_toolset)
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
    expect(mockExecuteTool).toHaveBeenCalledWith("create_node", {
      projectId: "proj-1",
      type: "CHAPTER",
      title: "New Chapter",
    });
  });

  it("handles tool execution errors gracefully", async () => {
    // LLM calls a tool
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-err",
                type: "function",
                function: {
                  name: "get_project",
                  arguments: JSON.stringify({ projectId: "nonexistent" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    // Tool returns an error
    mockExecuteTool.mockResolvedValueOnce(
      JSON.stringify({ error: true, tool: "get_project", message: "Project not found" })
    );

    // LLM handles the error gracefully
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "I couldn't find that project.", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Get nonexistent project" });
    const response = await POST(req as any);
    const chunks = await readSSE(response);

    const allContent = chunks
      .filter((c: any) => c.content)
      .map((c: any) => c.content)
      .join("");
    expect(allContent).toContain("couldn't find");
  });

  it("saves tool interactions as system messages in chat history", async () => {
    // LLM calls a tool then responds
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-save",
                type: "function",
                function: {
                  name: "list_projects",
                  arguments: JSON.stringify({}),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    mockExecuteTool.mockResolvedValueOnce(JSON.stringify([{ id: "p1", title: "Novel" }]));

    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "You have one project.", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "List my projects" });
    await POST(req as any);

    // Should save: user message, system (tool log), assistant response = 3 creates
    const createCalls = mockPrisma.chatMessage.create.mock.calls;
    expect(createCalls.length).toBe(3);

    // First: user message
    expect(createCalls[0][0].data.role).toBe("user");

    // Second: tool interaction log
    expect(createCalls[1][0].data.role).toBe("system");
    expect(createCalls[1][0].data.content).toContain("[Tool interactions]");
    expect(createCalls[1][0].data.content).toContain("list_projects");

    // Third: assistant response
    expect(createCalls[2][0].data.role).toBe("assistant");
  });

  it("handles multiple tool calls in a single LLM response", async () => {
    // LLM calls two tools at once
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-a",
                type: "function",
                function: {
                  name: "get_outline",
                  arguments: JSON.stringify({ projectId: "proj-1" }),
                },
              },
              {
                id: "call-b",
                type: "function",
                function: {
                  name: "list_story_objects",
                  arguments: JSON.stringify({ projectId: "proj-1" }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    mockExecuteTool
      .mockResolvedValueOnce(JSON.stringify({ chapters: [] }))
      .mockResolvedValueOnce(JSON.stringify([{ name: "Hero" }]));

    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: "Here's your project overview.", tool_calls: null },
          finish_reason: "stop",
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Give me an overview" });
    await POST(req as any);

    // Both tools were executed
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);

    // Second LLM call has both tool results
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResults = secondCallMessages.filter((m: any) => m.role === "tool");
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0].tool_call_id).toBe("call-a");
    expect(toolResults[1].tool_call_id).toBe("call-b");
  });

  it("respects MAX_TOOL_ITERATIONS to prevent infinite loops", async () => {
    // Make the LLM always call a tool (simulating a loop)
    for (let i = 0; i < 12; i++) {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: `call-loop-${i}`,
                  type: "function",
                  function: {
                    name: "list_projects",
                    arguments: JSON.stringify({}),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
      mockExecuteTool.mockResolvedValueOnce(JSON.stringify([]));
    }

    const req = makeRequest({ projectId: "proj-1", message: "infinite loop test" });
    const response = await POST(req as any);

    // Should have stopped at MAX_TOOL_ITERATIONS (10)
    expect(mockCreate).toHaveBeenCalledTimes(10);
    expect(response.status).toBe(200);
  });
});
