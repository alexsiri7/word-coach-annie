import { describe, it, expect } from "vitest";
import {
  formatStoryContext,
  formatToolLog,
  historyFetchLimit,
  selectHistoryWindow,
  summarizeToolResult,
  type StoryContext,
} from "@/lib/ai/chat-context";

const SETTINGS = { chatWindowSize: 3, messagesUntilCompression: 5, compressionModel: "" };

function storyContext(overrides: Partial<StoryContext> = {}): StoryContext {
  return {
    project: { title: "The Lighthouse", genre: null, synopsis: null },
    nodes: [],
    storyObjects: [],
    universe: null,
    ...overrides,
  };
}

describe("formatStoryContext", () => {
  it("nests scenes under their chapter with status and synopsis", () => {
    const text = formatStoryContext(
      storyContext({
        project: { title: "The Lighthouse", genre: "Gothic", synopsis: "A keeper's last winter." },
        nodes: [
          { id: "c1", type: "CHAPTER", title: "Arrival", parentId: null, synopsis: "She lands", status: "DRAFT" },
          { id: "s1", type: "SCENE", title: "The Dock", parentId: "c1", synopsis: "Fog", status: "REVISED" },
          { id: "s2", type: "SCENE", title: "Orphan", parentId: "c9", synopsis: null, status: "DRAFT" },
        ],
      })
    );

    expect(text).toContain("<project-title>The Lighthouse</project-title>\n<project-genre>Gothic</project-genre>");
    expect(text).toContain("<synopsis>\nA keeper's last winter.\n</synopsis>");
    expect(text).toContain("  Arrival — She lands\n    - The Dock [REVISED]: Fog");
    expect(text).not.toContain("Orphan");
  });

  it("groups story objects by type and truncates descriptions to 150 chars", () => {
    const text = formatStoryContext(
      storyContext({
        storyObjects: [
          { type: "CHARACTER", name: "Mara", description: "x".repeat(200), role: "keeper" },
          { type: "LOCATION", name: "The Tower", description: null, role: null },
        ],
      })
    );

    expect(text).toContain(`CHARACTER:\n  - Mara (keeper): ${"x".repeat(150)}\n`);
    expect(text).toContain("LOCATION:\n  - The Tower");
  });

  it("uses placeholders for an empty project and omits the universe section", () => {
    const text = formatStoryContext(storyContext());

    expect(text).toContain("(No chapters yet)");
    expect(text).toContain("(No characters/locations yet)");
    expect(text).not.toContain("<project-genre>");
    expect(text).not.toContain("Shared Universe");
  });

  it("lists world objects with their timeline states", () => {
    const text = formatStoryContext(
      storyContext({
        universe: {
          title: "The Coast",
          description: "Storm country",
          worldObjects: [
            { type: "CHARACTER", name: "Old Tom", description: null, timeline: [{ label: "1890", description: "alive" }] },
            { type: "LOCATION", name: "Harbour", description: "busy", timeline: [] },
          ],
        },
      })
    );

    expect(text).toContain("## Shared Universe\n<universe-title>The Coast</universe-title>\n<universe-description>Storm country</universe-description>");
    expect(text).toContain("CHARACTER:\n  - Old Tom\n    [1890] alive");
    expect(text).toContain("LOCATION:\n  - Harbour: busy\n</universe-objects>");
  });

  it("omits the universe section when the universe has no world objects", () => {
    const text = formatStoryContext(
      storyContext({ universe: { title: "Empty", description: null, worldObjects: [] } })
    );
    expect(text).not.toContain("Shared Universe");
  });
});

describe("selectHistoryWindow", () => {
  const messages = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("fetches one message past the compaction threshold so overflow is detectable", () => {
    expect(historyFetchLimit(SETTINGS)).toBe(9);
  });

  it("keeps the last chatWindowSize messages and does not compress at the threshold", () => {
    expect(selectHistoryWindow(messages(8), SETTINGS)).toEqual({ window: [5, 6, 7], toCompress: null });
  });

  it("compresses the first threshold-many messages once history overflows", () => {
    expect(selectHistoryWindow(messages(9), SETTINGS)).toEqual({
      window: [6, 7, 8],
      toCompress: [0, 1, 2, 3, 4, 5, 6, 7],
    });
  });
});

describe("summarizeToolResult", () => {
  const entry = (result: string) => ({ tool: "get_scene", args: {}, result });

  it("prefers title, then name, then summary from a JSON result", () => {
    expect(summarizeToolResult(entry(JSON.stringify({ title: "T", name: "N" })))).toBe("T");
    expect(summarizeToolResult(entry(JSON.stringify({ name: "N", summary: "S" })))).toBe("N");
    expect(summarizeToolResult(entry(JSON.stringify({ summary: "S" })))).toBe("S");
  });

  it("falls back to the first 200 chars of a result with no label or that is not JSON", () => {
    const json = JSON.stringify({ items: "y".repeat(300) });
    expect(summarizeToolResult(entry(json))).toBe(json.slice(0, 200));
    expect(summarizeToolResult(entry("z".repeat(300)))).toBe("z".repeat(200));
    expect(summarizeToolResult(entry("null"))).toBe("null");
  });
});

describe("formatToolLog", () => {
  it("records each call's args and truncated result, separated by rules", () => {
    const text = formatToolLog([
      { tool: "a", args: { id: 1 }, result: "r".repeat(600) },
      { tool: "b", args: {}, result: "ok" },
    ]);
    expect(text).toBe(
      `[Tool interactions]\nTool: a\nArgs: {"id":1}\nResult: ${"r".repeat(500)}\n---\nTool: b\nArgs: {}\nResult: ok`
    );
  });
});
