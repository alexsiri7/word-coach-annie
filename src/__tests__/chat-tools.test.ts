import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so they're available in vi.mock factories
const { mockRunChatAgent, mockPrisma, mockGetAiConfig } = vi.hoisted(() => ({
  mockRunChatAgent: vi.fn(),
  mockPrisma: {
    project: { findUnique: vi.fn() },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockGetAiConfig: vi.fn(),
}));

vi.mock("@/lib/ai/adk-agent", () => ({
  runChatAgent: (...args: unknown[]) => mockRunChatAgent(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: () => mockGetAiConfig(),
  getAiPreferences: vi.fn().mockResolvedValue({
    customInstructions: "",
    coachingStyle: "balanced",
    responseLength: "moderate",
  }),
  buildPreferenceInstructions: vi.fn().mockReturnValue(""),
}));

// Import after mocks
import { POST } from "@/app/api/chat/route";


function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readSSE(response: Response): Promise<any[]> {
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
  it("calls ADK agent with correct parameters", async () => {
    mockRunChatAgent.mockResolvedValueOnce({ finalContent: "Hello!", toolLog: [] });

    const req = makeRequest({ projectId: "proj-1", message: "Hi" });
    await POST(req as any);

    expect(mockRunChatAgent).toHaveBeenCalledTimes(1);
    const args = mockRunChatAgent.mock.calls[0][0];
    expect(args.systemPrompt).toContain("Test Novel");
    expect(args.userMessage).toBe("Hi");
    expect(args.aiConfig).toEqual({
      baseUrl: "https://test.example.com/v1",
      apiKey: "test-key",
      model: "test-model",
    });
  });

  it("streams tool events and content via SSE", async () => {
    mockRunChatAgent.mockResolvedValueOnce({
      finalContent: "Based on the outline, Chapter 1 looks great!",
      toolLog: [
        {
          tool: "get_outline",
          args: { projectId: "proj-1" },
          result: JSON.stringify({ chapters: [{ title: "Chapter 1" }] }),
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Show me the outline" });
    const response = await POST(req as any);
    const chunks = await readSSE(response);

    // Tool call event
    const toolCall = chunks.find((c: any) => c.type === "tool_call");
    expect(toolCall).toBeDefined();
    expect(toolCall!.name).toBe("get_outline");

    // Tool result event
    const toolResult = chunks.find((c: any) => c.type === "tool_result");
    expect(toolResult).toBeDefined();

    // Content
    const allContent = chunks
      .filter((c: any) => c.type === "content")
      .map((c: any) => c.content)
      .join("");
    expect(allContent).toContain("Chapter 1 looks great");
  });

  it("handles load_toolset via ADK agent", async () => {
    mockRunChatAgent.mockResolvedValueOnce({
      finalContent: "I created a new chapter for you.",
      toolLog: [
        {
          tool: "load_toolset",
          args: { category: "structure" },
          result: JSON.stringify({ loaded: "structure", toolCount: 11, tools: ["create_node"] }),
        },
        {
          tool: "create_node",
          args: { projectId: "proj-1", type: "CHAPTER", title: "New Chapter" },
          result: JSON.stringify({ id: "node-1", title: "New Chapter" }),
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Add a new chapter" });
    const response = await POST(req as any);
    const chunks = await readSSE(response);

    // Both tool calls were streamed
    const toolCalls = chunks.filter((c: any) => c.type === "tool_call");
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].name).toBe("load_toolset");
    expect(toolCalls[1].name).toBe("create_node");

    const allContent = chunks
      .filter((c: any) => c.type === "content")
      .map((c: any) => c.content)
      .join("");
    expect(allContent).toContain("created a new chapter");
  });

  it("handles tool execution errors gracefully", async () => {
    mockRunChatAgent.mockResolvedValueOnce({
      finalContent: "I couldn't find that project.",
      toolLog: [
        {
          tool: "get_project",
          args: { projectId: "nonexistent" },
          result: JSON.stringify({ error: true, message: "Project not found" }),
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
    mockRunChatAgent.mockResolvedValueOnce({
      finalContent: "You have one project.",
      toolLog: [
        {
          tool: "list_projects",
          args: {},
          result: JSON.stringify([{ id: "p1", title: "Novel" }]),
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

  it("handles multiple tool calls in agent response", async () => {
    mockRunChatAgent.mockResolvedValueOnce({
      finalContent: "Here's your project overview.",
      toolLog: [
        {
          tool: "get_outline",
          args: { projectId: "proj-1" },
          result: JSON.stringify({ chapters: [] }),
        },
        {
          tool: "list_story_objects",
          args: { projectId: "proj-1" },
          result: JSON.stringify([{ name: "Hero" }]),
        },
      ],
    });

    const req = makeRequest({ projectId: "proj-1", message: "Give me an overview" });
    const response = await POST(req as any);
    const chunks = await readSSE(response);

    const toolCalls = chunks.filter((c: any) => c.type === "tool_call");
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0].name).toBe("get_outline");
    expect(toolCalls[1].name).toBe("list_story_objects");
  });

  it("passes chat history to ADK agent", async () => {
    mockRunChatAgent.mockResolvedValueOnce({ finalContent: "Response", toolLog: [] });

    const req = makeRequest({ projectId: "proj-1", message: "test" });
    await POST(req as any);

    const args = mockRunChatAgent.mock.calls[0][0];
    expect(args.chatHistory).toEqual([
      { role: "user", content: "Hello" },
    ]);
  });
});
