import { describe, it, expect } from "vitest";
import { buildTimelineScenes } from "@/lib/timeline";
import type { OutlineNode } from "@/lib/types";

function makeNode(overrides: Partial<OutlineNode> & { type: OutlineNode["type"] }): OutlineNode {
  return {
    id: "id",
    projectId: "p",
    parentId: null,
    title: "Title",
    synopsis: "",
    status: "DRAFT",
    orderIndex: 0,
    createdAt: "",
    updatedAt: "",
    children: [],
    ...overrides,
  };
}

describe("buildTimelineScenes", () => {
  it("returns empty array for empty tree", () => {
    expect(buildTimelineScenes([])).toEqual([]);
  });

  it("collects root-level SCENE nodes with no chapterTitle", () => {
    const scene = makeNode({ id: "s1", type: "SCENE", title: "Prologue", orderIndex: 0 });
    expect(buildTimelineScenes([scene])).toEqual([
      { id: "s1", title: "Prologue", status: "DRAFT", orderIndex: 0, chapterTitle: undefined },
    ]);
  });

  it("propagates chapterTitle from CHAPTER parent", () => {
    const scene = makeNode({ id: "s1", type: "SCENE", title: "Scene 1", orderIndex: 0 });
    const chapter = makeNode({ id: "c1", type: "CHAPTER", title: "Chapter One", children: [scene] });
    const result = buildTimelineScenes([chapter]);
    expect(result).toHaveLength(1);
    expect(result[0].chapterTitle).toBe("Chapter One");
  });

  it("does NOT propagate PART title as chapterTitle — uses nested CHAPTER title", () => {
    const scene = makeNode({ id: "s1", type: "SCENE", title: "Scene 1", orderIndex: 0 });
    const chapter = makeNode({ id: "c1", type: "CHAPTER", title: "Chapter One", children: [scene] });
    const part = makeNode({ id: "pt1", type: "PART", title: "Part One", children: [chapter] });
    const result = buildTimelineScenes([part]);
    expect(result).toHaveLength(1);
    expect(result[0].chapterTitle).toBe("Chapter One"); // PART title must NOT be used
  });

  it("handles PART → SCENE directly (no chapter) — chapterTitle is undefined", () => {
    const scene = makeNode({ id: "s1", type: "SCENE", title: "Scene 1", orderIndex: 0 });
    const part = makeNode({ id: "pt1", type: "PART", title: "Part One", children: [scene] });
    const result = buildTimelineScenes([part]);
    expect(result).toHaveLength(1);
    expect(result[0].chapterTitle).toBeUndefined();
  });

  it("collects scenes from multiple chapters, each correctly scoped", () => {
    const s1 = makeNode({ id: "s1", type: "SCENE", title: "Scene 1", orderIndex: 0 });
    const s2 = makeNode({ id: "s2", type: "SCENE", title: "Scene 2", orderIndex: 0 });
    const ch1 = makeNode({ id: "c1", type: "CHAPTER", title: "Ch 1", children: [s1] });
    const ch2 = makeNode({ id: "c2", type: "CHAPTER", title: "Ch 2", children: [s2] });
    const result = buildTimelineScenes([ch1, ch2]);
    expect(result).toHaveLength(2);
    expect(result[0].chapterTitle).toBe("Ch 1");
    expect(result[1].chapterTitle).toBe("Ch 2");
  });

  it("handles PART → CHAPTER → SCENE (three levels) — uses CHAPTER title", () => {
    const scene = makeNode({ id: "s1", type: "SCENE", title: "Scene 1", orderIndex: 0 });
    const chapter = makeNode({ id: "c1", type: "CHAPTER", title: "Chapter One", children: [scene] });
    const part = makeNode({ id: "pt1", type: "PART", title: "Part One", children: [chapter] });
    const result = buildTimelineScenes([part]);
    expect(result).toHaveLength(1);
    expect(result[0].chapterTitle).toBe("Chapter One");
    expect(result[0].id).toBe("s1");
  });

  it("skips non-SCENE non-CHAPTER non-PART nodes and recurses into their children", () => {
    const scene = makeNode({ id: "s1", type: "SCENE", title: "Scene 1", orderIndex: 0 });
    // Use a node with an unknown type to verify recursion still works
    const unknownNode = { ...makeNode({ id: "u1", type: "CHAPTER" as OutlineNode["type"], title: "Chapter X", children: [scene] }), type: "CHAPTER" } as OutlineNode;
    const result = buildTimelineScenes([unknownNode]);
    expect(result).toHaveLength(1);
  });
});
