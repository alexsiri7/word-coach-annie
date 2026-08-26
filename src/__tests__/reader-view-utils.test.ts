import { describe, it, expect, vi, beforeEach } from "vitest";

// These tests exercise the DOM utility functions for Read View annotation highlighting.
// Because vitest runs in node environment and jsdom is not compatible with this project's
// version of undici (jsdom 30 requires undici 8 which fails on Node 20), we provide
// a minimal DOM mock that exercises the TreeWalker-based logic in isolation.
//
// The functions are pure TreeWalker walkers — the mock reproduces the TreeWalker
// text-node traversal contract faithfully enough to validate the logic.

import { getTextOffset, applyHighlight, parseAnnotationRange } from "../lib/reader-view-utils";

// ─── Minimal DOM mock ─────────────────────────────────────────────────────────

interface MockTextNode {
  nodeType: 3;
  textContent: string;
  parentElement: { tagName: string } | null;
  parentNode: MockNode | null;
}
interface MockElement {
  nodeType: 1;
  tagName: string;
  textContent: string;
  childNodes: MockNode[];
  querySelectorAll?: (sel: string) => any[];
  querySelector?: (sel: string) => any;
  innerHTML?: string;
  dataset?: Record<string, string>;
  className?: string;
}
type MockNode = MockTextNode | MockElement;

function makeTextNode(text: string, parent: MockElement | null = null): MockTextNode {
  return { nodeType: 3, textContent: text, parentElement: parent, parentNode: parent };
}

function makeElement(tag: string, children: MockNode[] = []): MockElement {
  const el: MockElement = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    textContent: children.map(c => c.textContent ?? "").join(""),
    childNodes: children,
    querySelectorAll: () => [],
    querySelector: () => null,
    innerHTML: "",
    dataset: {},
    className: "",
  };
  children.forEach(c => { (c as any).parentNode = el; (c as any).parentElement = el; });
  return el;
}

function buildTreeWalker(allTextNodes: MockTextNode[]) {
  let idx = -1;
  return {
    nextNode: () => {
      idx++;
      return idx < allTextNodes.length ? allTextNodes[idx] : null;
    },
  };
}

function _collectTextNodes(node: MockNode, result: MockTextNode[] = []): MockTextNode[] {
  if (node.nodeType === 3) {
    result.push(node as MockTextNode);
  } else {
    for (const child of (node as MockElement).childNodes) {
      _collectTextNodes(child, result);
    }
  }
  return result;
}

// ─── parseAnnotationRange ─────────────────────────────────────────────────────

describe("parseAnnotationRange", () => {
  it("returns null for empty string", () => {
    expect(parseAnnotationRange("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseAnnotationRange(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseAnnotationRange(undefined)).toBeNull();
  });

  it("returns parsed TextQuoteRange for valid textQuote JSON", () => {
    const r = JSON.stringify({ type: "textQuote", selectedText: "fox", prefix: "quick ", suffix: " jumps" });
    expect(parseAnnotationRange(r)).toEqual({ type: "textQuote", selectedText: "fox", prefix: "quick ", suffix: " jumps" });
  });

  it("returns parsed ProseRange for legacy {from, to} JSON", () => {
    const r = JSON.stringify({ from: 10, to: 20 });
    expect(parseAnnotationRange(r)).toEqual({ from: 10, to: 20 });
  });

  it("returns null for malformed JSON without throwing, and warns to console", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseAnnotationRange("{broken json");
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to parse"),
      expect.objectContaining({ range: "{broken json" })
    );
    warnSpy.mockRestore();
  });

  it("includes annotationId in warn when provided", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    parseAnnotationRange("{bad", "ann-123");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "ann-123" })
    );
    warnSpy.mockRestore();
  });
});

// ─── getTextOffset (logic) — tested via mock DOM ──────────────────────────────
//
// getTextOffset uses document.createTreeWalker which is a browser API. Since we
// cannot load jsdom in this vitest environment, we validate the function's
// behaviour by patching `document.createTreeWalker` with a mock that replays
// the text-node sequence faithfully.

const fakeContainer = makeElement("div") as unknown as Element;

describe("getTextOffset (with mock TreeWalker)", () => {
  function setupMockTreeWalker(textNodes: MockTextNode[]) {
    global.document = {
      createTreeWalker: () => buildTreeWalker(textNodes),
      createElement: (tag: string) => makeElement(tag),
    } as unknown as Document;
    global.NodeFilter = { SHOW_TEXT: 4 } as unknown as typeof NodeFilter;
    global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 } as unknown as typeof Node;
  }

  it("returns absolute offset for a text node at a cursor position", () => {
    const text = makeTextNode("Hello world");
    setupMockTreeWalker([text]);
    expect(getTextOffset(fakeContainer, text as unknown as Node, 5)).toBe(5);
  });

  it("accumulates offset across multiple text nodes", () => {
    const t1 = makeTextNode("Hello");
    const t2 = makeTextNode(" world");
    setupMockTreeWalker([t1, t2]);
    // Target is t2 with offset 3 → should be 5 + 3 = 8
    expect(getTextOffset(fakeContainer, t2 as unknown as Node, 3)).toBe(8);
  });

  it("returns -1 when targetNode is not inside container", () => {
    const t1 = makeTextNode("Hello");
    const foreign = makeTextNode("foreign");
    setupMockTreeWalker([t1]);
    expect(getTextOffset(fakeContainer, foreign as unknown as Node, 0)).toBe(-1);
  });

  it("returns 0 for offset 0 in first text node", () => {
    const text = makeTextNode("Test");
    setupMockTreeWalker([text]);
    expect(getTextOffset(fakeContainer, text as unknown as Node, 0)).toBe(0);
  });

  it("handles element node as targetNode (selection at start of block, offset 0)", () => {
    // When targetNode is an element with offset 0, no text before child index 0 → 0
    const t1 = makeTextNode("First");
    const t2 = makeTextNode("Second");
    const p1 = makeElement("p", [t1]);
    const p2 = makeElement("p", [t2]);
    const div = makeElement("div", [p1, p2]);

    // The walker visits t1, t2. Element target = p1, offset = 0.
    // We look for text ancestors whose index in p1.childNodes < 0 → none → total=0
    setupMockTreeWalker([t1, t2]);
    (p1 as any).childNodes = [t1];

    expect(getTextOffset(div as unknown as Element, p1 as unknown as Node, 0)).toBe(0);
  });

  it("handles element node as targetNode with offset 1 (after first child)", () => {
    // div contains [p1, p2]. offset=1 into div → sum text in p1 (="First") = 5
    const t1 = makeTextNode("First");
    const t2 = makeTextNode("Second");
    const p1 = makeElement("p", [t1]);
    const p2 = makeElement("p", [t2]);
    const div = makeElement("div", [p1, p2]);

    (t1 as any).parentNode = p1;
    (t1 as any).parentElement = p1;
    (t2 as any).parentNode = p2;
    (t2 as any).parentElement = p2;
    (p1 as any).childNodes = [t1];
    (p2 as any).childNodes = [t2];
    (div as any).childNodes = [p1, p2];

    setupMockTreeWalker([t1, t2]);

    expect(getTextOffset(div as unknown as Element, div as unknown as Node, 1)).toBe(5);
  });
});

// ─── applyHighlight (logic) ───────────────────────────────────────────────────
//
// applyHighlight uses TreeWalker + createRange/surroundContents which are complex
// browser APIs. The critical logic is the index computation (prefix match →
// first-occurrence fallback). We test this by patching the TreeWalker to return
// controlled text nodes and stubbing createRange so we can observe which text
// span is selected.

describe("applyHighlight index logic (with mock TreeWalker)", () => {
  beforeEach(() => {
    global.NodeFilter = { SHOW_TEXT: 4 } as unknown as typeof NodeFilter;
    global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 } as unknown as typeof Node;
  });

  function setupSimpleContainer(text: string) {
    const textNode = { nodeType: 3, textContent: text, parentElement: null } as any;
    let rangeStart = -1, rangeEnd = -1;
    global.document = {
      createTreeWalker: () => buildTreeWalker([textNode]),
      createRange: () => ({
        setStart: (node: any, off: number) => { rangeStart = off; },
        setEnd: (node: any, off: number) => { rangeEnd = off; },
        surroundContents: () => {},
      }),
      createElement: (tag: string) => ({ tagName: tag.toUpperCase(), dataset: {}, className: "" }),
    } as unknown as Document;
    return { textNode, getRangeStart: () => rangeStart, getRangeEnd: () => rangeEnd };
  }

  it("highlights at correct offset without prefix", () => {
    const { getRangeStart, getRangeEnd } = setupSimpleContainer("The quick brown fox jumps.");
    applyHighlight(fakeContainer, "fox", "ann-1");
    expect(getRangeStart()).toBe(16); // "The quick brown " = 16 chars
    expect(getRangeEnd()).toBe(19);
  });

  it("uses prefix to find second occurrence", () => {
    const { getRangeStart, getRangeEnd } = setupSimpleContainer("the cat and the dog");
    applyHighlight(fakeContainer, "the", "ann-2", " and ");
    // "the cat and the dog"
    // prefix " and " + "the" starts at index 7 → contextIdx=7, idx=7+5=12
    expect(getRangeStart()).toBe(12);
    expect(getRangeEnd()).toBe(15);
  });

  it("falls back to first occurrence when prefix not found", () => {
    const { getRangeStart } = setupSimpleContainer("the cat and the dog");
    applyHighlight(fakeContainer, "the", "ann-3", "ZZZZ");
    // Falls back to first "the" at idx=0
    expect(getRangeStart()).toBe(0);
  });

  it("does nothing when searchText not found in container", () => {
    const { getRangeStart } = setupSimpleContainer("The quick brown fox.");
    applyHighlight(fakeContainer, "elephant", "ann-4");
    // createRange is never called — rangeStart stays at -1
    expect(getRangeStart()).toBe(-1);
  });

  it("does nothing when searchText is empty", () => {
    const { getRangeStart } = setupSimpleContainer("Some text.");
    applyHighlight(fakeContainer, "", "ann-5");
    expect(getRangeStart()).toBe(-1);
  });
});
