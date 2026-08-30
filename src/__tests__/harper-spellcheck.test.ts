// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  charOffsetToPos,
  HarperSpellcheck,
} from "@/components/editor/extensions/harper-spellcheck";
import { Node as PmNode, Schema } from "@tiptap/pm/model";

const mockLint = vi.fn().mockResolvedValue([]);
const mockDispose = vi.fn().mockResolvedValue(undefined);

vi.mock("harper.js", () => {
  const WorkerLinter = vi.fn().mockImplementation(function (this: {
    lint: typeof mockLint;
    dispose: typeof mockDispose;
  }) {
    this.lint = mockLint;
    this.dispose = mockDispose;
  });
  return { WorkerLinter };
});

vi.mock("harper.js/binary", () => ({
  binary: { url: "mock-binary" },
}));

const testSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", group: "block" },
    text: { inline: true },
  },
});

function createDoc(...paragraphs: string[]): PmNode {
  const pNodes = paragraphs.map((text) =>
    testSchema.node("paragraph", null, text ? [testSchema.text(text)] : []),
  );
  return testSchema.node("doc", null, pNodes);
}

describe("charOffsetToPos", () => {
  it("maps char offset 0 to doc start position (inside first paragraph)", () => {
    const doc = createDoc("Hello world");
    const pos = charOffsetToPos(doc, 0);
    expect(pos).toBe(1);
  });

  it("correctly maps mid-word offset in single paragraph", () => {
    const doc = createDoc("Hello world");
    // "Hello world" — offset 6 = 'w'
    const pos = charOffsetToPos(doc, 6);
    expect(pos).toBe(7);
  });

  it("maps offset at end of single paragraph text", () => {
    const doc = createDoc("Hello");
    // offset 4 = 'o' (last char)
    const pos = charOffsetToPos(doc, 4);
    expect(pos).toBe(5);
  });

  it("maps across paragraph boundary (second paragraph)", () => {
    const doc = createDoc("Hi", "World");
    // doc.textBetween with " " separator → "Hi World"
    // flat offsets: H=0, i=1, ' '=2 (block separator), W=3, o=4, …
    const pos = charOffsetToPos(doc, 3);
    // ProseMirror token layout:
    //   pos 0: p1 open | pos 1: 'H' | pos 2: 'i' | pos 3: p1 close
    //   pos 4: p2 open | pos 5: 'W' | pos 6: 'o' | …
    // 'W' is at pos 5
    expect(pos).toBe(5);
  });
});

describe("charOffsetToPos — edge cases", () => {
  it("returns pos 1 (fallback) for offset beyond document length", () => {
    const doc = createDoc("Hi");
    // Document has only 2 chars; offset 99 is out of range
    const pos = charOffsetToPos(doc, 99);
    expect(pos).toBe(1);
  });

  it("maps offset exactly at separator boundary", () => {
    // "Hi" + separator + "World" => "Hi World"
    // Separator is at index 2, so offset 2 is the separator itself
    const doc = createDoc("Hi", "World");
    const pos = charOffsetToPos(doc, 2);
    // The separator is virtual; acceptable result is at start of second paragraph text (>= 4)
    expect(pos).toBeGreaterThanOrEqual(4);
  });

  it("handles document with an empty paragraph between text blocks", () => {
    const doc = createDoc("Hello", "", "World");
    // "Hello  World" — textBetween produces separators for each block boundary
    // Verify we can look up a position inside "World" without crashing
    const helloLen = 5;
    // Two separators: one after "Hello", one for the empty paragraph
    const wPos = charOffsetToPos(doc, helloLen + 2);
    const resolved = doc.resolve(wPos);
    expect(resolved.pos).toBeGreaterThan(0);
  });

  it("maps offset 0 when first paragraph is empty", () => {
    const doc = createDoc("", "World");
    // First paragraph is empty; offset 0 should not crash
    const pos = charOffsetToPos(doc, 0);
    expect(pos).toBeGreaterThanOrEqual(1);
  });
});

describe("HarperSpellcheck — re-enable toggle (#reenable-fix)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLint.mockClear().mockResolvedValue([]);
    mockDispose.mockClear().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resumes linting (calls linter.lint again) after being disabled and re-enabled, with no doc edit", async () => {
    const editor = new Editor({
      extensions: [StarterKit, HarperSpellcheck],
      content: "<p>Hello wrold</p>",
    });

    try {
      // Let the extension's lazy harper.js import + initial scheduled lint run.
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockLint).toHaveBeenCalled();

      // Disable spell-check.
      editor.commands.setSpellCheckEnabled(false);
      mockLint.mockClear();

      // Re-enable without touching the document at all — before the fix,
      // nothing would ever call linter.lint() again until the next edit.
      editor.commands.setSpellCheckEnabled(true);
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockLint).toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });
});
