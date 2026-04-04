/**
 * Eval tests for ADK agent behavior.
 *
 * These tests exercise the full ADK agent loop (LlmAgent + InMemoryRunner +
 * DynamicToolset) with a scripted mock LLM. They verify end-to-end behavior:
 * tool selection, multi-step orchestration, load_toolset patterns, chat history
 * handling, and error recovery — the same things a real LLM eval would check,
 * but deterministic and fast.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BaseLlm,
  type LlmRequest,
  type LlmResponse,
  type BaseLlmConnection,
} from "@google/adk";
import type { Content } from "@google/genai";
import { runChatAgent, type ChatAgentResult } from "@/lib/ai/adk-agent";

// ─── Scripted Mock LLM ──────────────────────────────────────────────────────
//
// Each test provides a sequence of scripted responses. The mock yields them in
// order, simulating an LLM that makes tool calls then produces a final answer.

interface ScriptedTurn {
  /** Text content to return (null if tool-call-only turn) */
  text?: string | null;
  /** Tool calls to make this turn */
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
  /** Whether this is the final turn (sets turnComplete) */
  done?: boolean;
}

class ScriptedLlm extends BaseLlm {
  private turns: ScriptedTurn[];
  private turnIndex = 0;
  /** Captured requests for assertion */
  public requests: LlmRequest[] = [];

  static override readonly supportedModels = [/scripted-.*/];

  constructor(turns: ScriptedTurn[]) {
    super({ model: "scripted-eval" });
    this.turns = turns;
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
  ): AsyncGenerator<LlmResponse, void> {
    this.requests.push(llmRequest);

    const turn = this.turns[this.turnIndex++];
    if (!turn) {
      yield {
        content: { role: "model", parts: [{ text: "(no more scripted turns)" }] },
        turnComplete: true,
      };
      return;
    }

    const parts: Content["parts"] = [];

    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const tc of turn.toolCalls) {
        parts.push({
          functionCall: { id: tc.id, name: tc.name, args: tc.args },
        });
      }
    }

    if (turn.text != null) {
      parts.push({ text: turn.text });
    }

    yield {
      content: { role: "model", parts },
      turnComplete: turn.done ?? (turn.toolCalls == null || turn.toolCalls.length === 0),
    };
  }

  async connect(): Promise<BaseLlmConnection> {
    throw new Error("Not supported");
  }
}

// ─── Mock the OpenAI import so adk-agent.ts uses our scripted LLM ───────────
//
// We intercept the OpenAICompatibleLlm constructor to inject our ScriptedLlm
// instead, while keeping the rest of adk-agent.ts real (DynamicToolset, runner).

let activeLlm: ScriptedLlm | null = null;

vi.mock("@/lib/ai/adk-openai-llm", () => ({
  OpenAICompatibleLlm: class {
    constructor() {
      // Return the active scripted LLM — tests set this before calling runChatAgent
      return activeLlm!;
    }
  },
}));

// Mock all tool executors to return deterministic results
// We mock the entire tool handler modules to avoid hitting the real DB
vi.mock("@/mcp/tools/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([
    { id: "proj-1", title: "Test Novel" },
    { id: "proj-2", title: "Short Stories" },
  ]),
  getProject: vi.fn().mockResolvedValue({
    id: "proj-1",
    title: "Test Novel",
    genre: "Fantasy",
  }),
  createProject: vi.fn().mockResolvedValue({ id: "proj-new", title: "New Project" }),
  updateProject: vi.fn().mockResolvedValue({ id: "proj-1", title: "Updated" }),
}));

vi.mock("@/mcp/tools/structure", () => ({
  getOutline: vi.fn().mockResolvedValue({
    id: "proj-1",
    children: [
      { id: "ch-1", title: "Chapter 1", type: "CHAPTER", children: [] },
    ],
  }),
  createNode: vi.fn().mockResolvedValue({ id: "node-new", title: "New Chapter", type: "CHAPTER" }),
  updateNode: vi.fn().mockResolvedValue({ id: "node-1", title: "Updated Chapter" }),
  deleteNode: vi.fn().mockResolvedValue({ success: true }),
  readSceneContent: vi.fn().mockResolvedValue({
    nodeId: "sc-1",
    content: "It was a dark and stormy night.",
  }),
  writeSceneContent: vi.fn().mockResolvedValue({ success: true }),
  writeSceneContentFromBlocks: vi.fn().mockResolvedValue({ success: true }),
  getSceneVersions: vi.fn().mockResolvedValue([]),
  restoreSceneVersion: vi.fn().mockResolvedValue({ success: true }),
  addAnnotation: vi.fn().mockResolvedValue({ id: "ann-1" }),
  updateAnnotation: vi.fn().mockResolvedValue({ id: "ann-1" }),
  deleteAnnotation: vi.fn().mockResolvedValue({ success: true }),
  resolveAnnotation: vi.fn().mockResolvedValue({ success: true }),
  getOpenAnnotations: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/mcp/tools/story-objects", () => ({
  listStoryObjects: vi.fn().mockResolvedValue([
    { id: "so-1", name: "Hero", type: "CHARACTER" },
  ]),
  getStoryObject: vi.fn().mockResolvedValue({ id: "so-1", name: "Hero" }),
  createStoryObject: vi.fn().mockResolvedValue({ id: "so-new", name: "Villain" }),
  updateStoryObject: vi.fn().mockResolvedValue({ id: "so-1", name: "Updated Hero" }),
  deleteStoryObject: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/mcp/tools/relationships", () => ({
  listRelationships: vi.fn().mockResolvedValue([]),
  createRelationship: vi.fn().mockResolvedValue({ id: "rel-1" }),
  deleteRelationship: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/mcp/tools/export", () => ({
  exportManuscript: vi.fn().mockResolvedValue({ markdown: "# Test" }),
  exportStoryBible: vi.fn().mockResolvedValue({ markdown: "# Bible" }),
  exportHashnode: vi.fn().mockResolvedValue({ html: "<p>Test</p>" }),
  getProjectSummary: vi.fn().mockResolvedValue({ title: "Test", wordCount: 1000 }),
}));

vi.mock("@/mcp/tools/snapshots", () => ({
  snapshotDatabase: vi.fn().mockResolvedValue({ hash: "abc123" }),
  listDatabaseSnapshots: vi.fn().mockResolvedValue([]),
  restoreDatabaseSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/mcp/tools/universes", () => ({
  listUniverses: vi.fn().mockResolvedValue([]),
  getUniverse: vi.fn().mockResolvedValue({ id: "u-1", name: "Test Universe" }),
  createUniverse: vi.fn().mockResolvedValue({ id: "u-new" }),
  updateUniverse: vi.fn().mockResolvedValue({ id: "u-1" }),
  deleteUniverse: vi.fn().mockResolvedValue({ success: true }),
  listWorldObjects: vi.fn().mockResolvedValue([]),
  getWorldObject: vi.fn().mockResolvedValue({ id: "wo-1" }),
  createWorldObject: vi.fn().mockResolvedValue({ id: "wo-new" }),
  updateWorldObject: vi.fn().mockResolvedValue({ id: "wo-1" }),
  deleteWorldObject: vi.fn().mockResolvedValue({ success: true }),
  addTimelineEntry: vi.fn().mockResolvedValue({ id: "te-1" }),
  updateTimelineEntry: vi.fn().mockResolvedValue({ id: "te-1" }),
  deleteTimelineEntry: vi.fn().mockResolvedValue({ success: true }),
  reorderTimelineEntries: vi.fn().mockResolvedValue({ success: true }),
  transferStoryObjectToUniverse: vi.fn().mockResolvedValue({ success: true }),
  linkProjectToUniverse: vi.fn().mockResolvedValue({ success: true }),
  unlinkProjectFromUniverse: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/mcp/skills", () => ({
  listSkills: vi.fn().mockResolvedValue([{ name: "summarize", description: "Summarize text" }]),
}));

vi.mock("@/lib/controllers/google-auth", () => ({
  GoogleAuthController: {
    getStatus: vi.fn().mockResolvedValue({ connected: false }),
    getAuthUrl: vi.fn().mockReturnValue("https://auth.example.com"),
    handleCallback: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/export/google-docs-exporter", () => ({
  GoogleDocsExporter: {
    exportToGoogleDocs: vi.fn().mockResolvedValue({ docUrl: "https://docs.google.com/test" }),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultConfig = {
  baseUrl: "https://test.example.com/v1",
  apiKey: "test-key",
  model: "test-model",
};

async function runWithScript(
  turns: ScriptedTurn[],
  opts: {
    userMessage?: string;
    systemPrompt?: string;
    chatHistory?: { role: string; content: string }[];
  } = {},
): Promise<ChatAgentResult> {
  const llm = new ScriptedLlm(turns);
  activeLlm = llm;

  const result = await runChatAgent({
    systemPrompt: opts.systemPrompt ?? "You are a writing assistant.",
    chatHistory: opts.chatHistory ?? [],
    userMessage: opts.userMessage ?? "Hello",
    aiConfig: defaultConfig,
  });

  activeLlm = null;
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  activeLlm = null;
});

describe("Agent eval: basic responses", () => {
  it("returns text-only response when no tools are needed", async () => {
    const result = await runWithScript([
      { text: "Hello! How can I help with your writing today?", done: true },
    ]);

    expect(result.finalContent).toBe(
      "Hello! How can I help with your writing today?",
    );
    expect(result.toolLog).toHaveLength(0);
  });

  it("preserves the full text content without truncation", async () => {
    const longText =
      "This is a detailed response about your novel's structure. " +
      "Chapter 1 establishes the protagonist's ordinary world. " +
      "Chapter 2 introduces the inciting incident. " +
      "Chapter 3 develops the first plot point.";

    const result = await runWithScript([{ text: longText, done: true }]);

    expect(result.finalContent).toBe(longText);
  });
});

describe("Agent eval: single tool use", () => {
  it("calls a core tool and captures the result in toolLog", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "list_projects", args: {} },
        ],
      },
      { text: "You have 2 projects: Test Novel and Short Stories.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].tool).toBe("list_projects");
    expect(JSON.parse(result.toolLog[0].result)).toEqual([
      { id: "proj-1", title: "Test Novel" },
      { id: "proj-2", title: "Short Stories" },
    ]);
    expect(result.finalContent).toContain("2 projects");
  });

  it("passes tool arguments correctly", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "get_project", args: { projectId: "proj-1" } },
        ],
      },
      { text: "Your project 'Test Novel' is a Fantasy genre story.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].args).toEqual({ projectId: "proj-1" });
    const toolResult = JSON.parse(result.toolLog[0].result);
    expect(toolResult.genre).toBe("Fantasy");
  });

  it("reads scene content via core tools", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "read_scene_content", args: { nodeId: "sc-1" } },
        ],
      },
      { text: "The scene opens with: 'It was a dark and stormy night.'", done: true },
    ]);

    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].tool).toBe("read_scene_content");
    const toolResult = JSON.parse(result.toolLog[0].result);
    expect(toolResult.content).toContain("dark and stormy night");
  });
});

describe("Agent eval: load_toolset pattern", () => {
  it("loads a category then uses a tool from that category", async () => {
    const result = await runWithScript([
      // Turn 1: Agent loads the structure category
      {
        toolCalls: [
          { id: "call_1", name: "load_toolset", args: { category: "structure" } },
        ],
      },
      // Turn 2: Agent uses a structure tool
      {
        toolCalls: [
          {
            id: "call_2",
            name: "create_node",
            args: { projectId: "proj-1", type: "CHAPTER", title: "New Chapter" },
          },
        ],
      },
      // Turn 3: Final text response
      { text: "I've created a new chapter called 'New Chapter'.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[0].tool).toBe("load_toolset");
    expect(result.toolLog[0].args).toEqual({ category: "structure" });
    expect(result.toolLog[1].tool).toBe("create_node");
    expect(result.finalContent).toContain("New Chapter");
  });

  it("loads characters category and creates a story object", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "load_toolset", args: { category: "characters" } },
        ],
      },
      {
        toolCalls: [
          {
            id: "call_2",
            name: "create_story_object",
            args: { projectId: "proj-1", name: "Villain", type: "CHARACTER" },
          },
        ],
      },
      { text: "I've created a new character called 'Villain'.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[0].tool).toBe("load_toolset");
    expect(result.toolLog[1].tool).toBe("create_story_object");
  });

  it("loads multiple categories in a single session", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "load_toolset", args: { category: "structure" } },
        ],
      },
      {
        toolCalls: [
          { id: "call_2", name: "get_outline", args: { projectId: "proj-1" } },
        ],
      },
      {
        toolCalls: [
          { id: "call_3", name: "load_toolset", args: { category: "characters" } },
        ],
      },
      {
        toolCalls: [
          { id: "call_4", name: "list_story_objects", args: { projectId: "proj-1" } },
        ],
      },
      {
        text: "Your project has 1 chapter and 1 character (Hero).",
        done: true,
      },
    ]);

    expect(result.toolLog).toHaveLength(4);
    expect(result.toolLog[0].tool).toBe("load_toolset");
    expect(result.toolLog[1].tool).toBe("get_outline");
    expect(result.toolLog[2].tool).toBe("load_toolset");
    expect(result.toolLog[3].tool).toBe("list_story_objects");
  });
});

describe("Agent eval: multi-tool orchestration", () => {
  it("calls multiple tools sequentially to gather context", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "get_project", args: { projectId: "proj-1" } },
        ],
      },
      {
        toolCalls: [
          { id: "call_2", name: "get_outline", args: { projectId: "proj-1" } },
        ],
      },
      {
        toolCalls: [
          {
            id: "call_3",
            name: "get_project_summary",
            args: { projectId: "proj-1" },
          },
        ],
      },
      {
        text: "Your project 'Test Novel' has 1 chapter and 1000 words.",
        done: true,
      },
    ]);

    expect(result.toolLog).toHaveLength(3);
    expect(result.toolLog.map((t) => t.tool)).toEqual([
      "get_project",
      "get_outline",
      "get_project_summary",
    ]);
    expect(result.finalContent).toContain("1000 words");
  });

  it("handles a read-then-write workflow", async () => {
    const result = await runWithScript([
      // Read the outline to find where to add content
      {
        toolCalls: [
          { id: "call_1", name: "get_outline", args: { projectId: "proj-1" } },
        ],
      },
      // Load structure tools to write
      {
        toolCalls: [
          { id: "call_2", name: "load_toolset", args: { category: "structure" } },
        ],
      },
      // Read current content
      {
        toolCalls: [
          { id: "call_3", name: "read_scene_content", args: { nodeId: "ch-1" } },
        ],
      },
      // Write updated content
      {
        toolCalls: [
          {
            id: "call_4",
            name: "write_scene_content",
            args: { nodeId: "ch-1", content: "Revised opening paragraph." },
          },
        ],
      },
      { text: "I've updated Chapter 1 with a revised opening.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(4);
    expect(result.toolLog.map((t) => t.tool)).toEqual([
      "get_outline",
      "load_toolset",
      "read_scene_content",
      "write_scene_content",
    ]);
  });
});

describe("Agent eval: parallel tool calls", () => {
  it("handles multiple tool calls in a single turn", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "get_project", args: { projectId: "proj-1" } },
          { id: "call_2", name: "get_outline", args: { projectId: "proj-1" } },
        ],
      },
      {
        text: "Here's your project overview: Test Novel with 1 chapter.",
        done: true,
      },
    ]);

    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[0].tool).toBe("get_project");
    expect(result.toolLog[1].tool).toBe("get_outline");
  });
});

describe("Agent eval: chat history", () => {
  it("passes prior conversation context to the agent", async () => {
    const llm = new ScriptedLlm([
      { text: "As I mentioned, your project is Fantasy.", done: true },
    ]);
    activeLlm = llm;

    const result = await runChatAgent({
      systemPrompt: "You are a writing assistant.",
      chatHistory: [
        { role: "user", content: "What genre is my project?" },
        { role: "assistant", content: "Your project is Fantasy." },
      ],
      userMessage: "Can you remind me?",
      aiConfig: defaultConfig,
    });

    expect(result.finalContent).toContain("Fantasy");

    // Verify the LLM received the history in its request
    const request = llm.requests[0];
    // The runner builds session events from history, which get included
    // in the LLM request contents. We verify the new user message is present.
    const allParts = request.contents
      .flatMap((c) => c.parts ?? [])
      .filter((p) => p.text != null)
      .map((p) => p.text);
    expect(allParts).toContain("Can you remind me?");

    activeLlm = null;
  });

  it("skips system messages in chat history", async () => {
    const llm = new ScriptedLlm([
      { text: "Sure, I can help.", done: true },
    ]);
    activeLlm = llm;

    await runChatAgent({
      systemPrompt: "You are a writing assistant.",
      chatHistory: [
        { role: "user", content: "Hello" },
        { role: "system", content: "[Tool interactions] ..." },
        { role: "assistant", content: "Hi there!" },
      ],
      userMessage: "Help me write",
      aiConfig: defaultConfig,
    });

    // The system message should be filtered out
    const request = llm.requests[0];
    const allParts = request.contents
      .flatMap((c) => c.parts ?? [])
      .filter((p) => p.text != null)
      .map((p) => p.text);
    expect(allParts).not.toContain("[Tool interactions] ...");

    activeLlm = null;
  });
});

describe("Agent eval: tool error handling", () => {
  it("captures tool errors in toolLog without crashing", async () => {
    // Override one mock to throw
    const { getProject } = await import("@/mcp/tools/projects");
    (getProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Project not found"),
    );

    // The agent should still complete — ADK wraps tool errors
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "get_project", args: { projectId: "nonexistent" } },
        ],
      },
      { text: "I couldn't retrieve that project.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0].tool).toBe("get_project");
    // The result should contain the error (ADK wraps it)
    expect(result.finalContent).toContain("couldn't retrieve");
  });
});

describe("Agent eval: export workflow", () => {
  it("loads export category and exports manuscript", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "load_toolset", args: { category: "export" } },
        ],
      },
      {
        toolCalls: [
          {
            id: "call_2",
            name: "export_manuscript",
            args: { projectId: "proj-1" },
          },
        ],
      },
      { text: "I've exported your manuscript.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[1].tool).toBe("export_manuscript");
    const exportResult = JSON.parse(result.toolLog[1].result);
    expect(exportResult.markdown).toBe("# Test");
  });
});

describe("Agent eval: admin tools", () => {
  it("loads admin category and creates a snapshot", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "load_toolset", args: { category: "admin" } },
        ],
      },
      {
        toolCalls: [
          {
            id: "call_2",
            name: "snapshot_database",
            args: { message: "Before major edit" },
          },
        ],
      },
      { text: "Database snapshot created.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[1].tool).toBe("snapshot_database");
    const snapResult = JSON.parse(result.toolLog[1].result);
    expect(snapResult.hash).toBe("abc123");
  });
});

describe("Agent eval: world building workflow", () => {
  it("loads world_building and creates a universe", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "load_toolset", args: { category: "world_building" } },
        ],
      },
      {
        toolCalls: [
          {
            id: "call_2",
            name: "create_universe",
            args: { name: "Middle Earth", description: "A fantasy world" },
          },
        ],
      },
      { text: "I've created the universe 'Middle Earth'.", done: true },
    ]);

    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[1].tool).toBe("create_universe");
  });
});

describe("Agent eval: result structure", () => {
  it("returns ChatAgentResult with correct shape", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "list_projects", args: {} },
        ],
      },
      { text: "Done.", done: true },
    ]);

    // Verify the result matches the ChatAgentResult interface
    expect(result).toHaveProperty("finalContent");
    expect(result).toHaveProperty("toolLog");
    expect(typeof result.finalContent).toBe("string");
    expect(Array.isArray(result.toolLog)).toBe(true);

    // Each tool log entry has the right shape
    for (const entry of result.toolLog) {
      expect(entry).toHaveProperty("tool");
      expect(entry).toHaveProperty("args");
      expect(entry).toHaveProperty("result");
      expect(typeof entry.tool).toBe("string");
      expect(typeof entry.args).toBe("object");
      expect(typeof entry.result).toBe("string");
    }
  });

  it("returns empty toolLog for text-only responses", async () => {
    const result = await runWithScript([
      { text: "Just a text response.", done: true },
    ]);

    expect(result.toolLog).toEqual([]);
    expect(result.finalContent).toBe("Just a text response.");
  });

  it("returns the last text content as finalContent in multi-turn", async () => {
    const result = await runWithScript([
      {
        toolCalls: [
          { id: "call_1", name: "list_projects", args: {} },
        ],
      },
      { text: "Final answer after tool use.", done: true },
    ]);

    expect(result.finalContent).toBe("Final answer after tool use.");
  });
});
