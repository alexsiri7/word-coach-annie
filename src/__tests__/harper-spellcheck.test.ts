import { describe, it, expect } from "vitest";
import { charOffsetToPos } from "@/components/editor/extensions/harper-spellcheck";
import { Node as PmNode, Schema } from "@tiptap/pm/model";

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
    // textBetween with " " separator: "Hi World"
    // offset 0='H', 1='i', 2=' '(separator), 3='W', 4='o', ...
    const pos = charOffsetToPos(doc, 3);
    // Second paragraph: doc(0) > p1(1) > "Hi"(1-2) > /p1(3) > p2(4) > "World"(4-8) > /p2(9)
    // 'W' is at pos 4
    expect(pos).toBe(4);
  });
});

describe("HarperSpellcheck extension", () => {
  it("exports charOffsetToPos as a function", () => {
    expect(typeof charOffsetToPos).toBe("function");
  });
});
