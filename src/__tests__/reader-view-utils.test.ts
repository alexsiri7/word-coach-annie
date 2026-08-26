// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { applyHighlight, removeHighlights, collectSceneNodes } from "@/app/read/[id]/reader-view";

// ─── applyHighlight ───────────────────────────────────────────────────────────

describe("applyHighlight", () => {
  function makeContainer(html: string): HTMLElement {
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  function cleanup(el: HTMLElement) {
    document.body.removeChild(el);
  }

  it("wraps matching text in a <mark> with data-annotation-id", () => {
    const container = makeContainer("<p>Hello world</p>");
    applyHighlight(container, "world", "ann-1");
    const mark = container.querySelector("mark[data-annotation-id='ann-1']");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("world");
    cleanup(container);
  });

  it("is a no-op when searchText is empty", () => {
    const container = makeContainer("<p>Hello</p>");
    applyHighlight(container, "", "ann-1");
    expect(container.querySelectorAll("mark").length).toBe(0);
    cleanup(container);
  });

  it("is a no-op when searchText is not found", () => {
    const container = makeContainer("<p>Hello</p>");
    applyHighlight(container, "xyz", "ann-1");
    expect(container.querySelectorAll("mark").length).toBe(0);
    cleanup(container);
  });

  it("does not double-highlight text already inside a <mark>", () => {
    const container = makeContainer('<p><mark data-annotation-id="ann-0">world</mark></p>');
    applyHighlight(container, "world", "ann-1");
    // Should still only have one mark (the original) since existing marks are skipped
    expect(container.querySelectorAll("mark").length).toBe(1);
    cleanup(container);
  });

  it("sets the correct annotation id on the mark element", () => {
    const container = makeContainer("<p>foo bar baz</p>");
    applyHighlight(container, "bar", "my-annotation-id");
    const mark = container.querySelector("mark");
    expect(mark?.dataset.annotationId).toBe("my-annotation-id");
    cleanup(container);
  });
});

// ─── removeHighlights ─────────────────────────────────────────────────────────

describe("removeHighlights", () => {
  it("removes all annotation marks and restores plain text", () => {
    const container = document.createElement("div");
    container.innerHTML = '<p>Hello <mark data-annotation-id="ann-1">world</mark></p>';
    document.body.appendChild(container);

    removeHighlights(container);
    expect(container.querySelectorAll("mark").length).toBe(0);
    expect(container.textContent).toBe("Hello world");

    document.body.removeChild(container);
  });

  it("removes multiple marks", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<p><mark data-annotation-id="a1">foo</mark> bar <mark data-annotation-id="a2">baz</mark></p>';
    document.body.appendChild(container);

    removeHighlights(container);
    expect(container.querySelectorAll("mark").length).toBe(0);
    expect(container.textContent).toContain("foo");
    expect(container.textContent).toContain("baz");

    document.body.removeChild(container);
  });

  it("is a no-op when there are no marks", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>No marks here</p>";
    removeHighlights(container);
    expect(container.querySelectorAll("mark").length).toBe(0);
    expect(container.textContent).toBe("No marks here");
  });
});

// ─── collectSceneNodes ────────────────────────────────────────────────────────

type OutlineNode = {
  id: string;
  type: string;
  title: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
};

function makeNode(
  id: string,
  type: string,
  content: string | undefined,
  children: OutlineNode[] = []
): OutlineNode {
  return { id, type, title: id, orderIndex: 0, parentId: null, children, content };
}

describe("collectSceneNodes", () => {
  it("collects non-empty scenes at the top level", () => {
    const nodes = [
      makeNode("sc-1", "SCENE", "<p>Text</p>"),
      makeNode("sc-2", "SCENE", "<p></p>"),
      makeNode("sc-3", "SCENE", ""),
      makeNode("sc-4", "SCENE", undefined),
    ];
    const result = collectSceneNodes(nodes);
    expect(result.map((n) => n.id)).toEqual(["sc-1"]);
  });

  it("collects scenes recursively inside chapters", () => {
    const nodes = [
      makeNode("ch-1", "CHAPTER", undefined, [
        makeNode("sc-1", "SCENE", "<p>Text</p>"),
        makeNode("sc-2", "SCENE", "<p></p>"),
      ]),
    ];
    const result = collectSceneNodes(nodes);
    expect(result.map((n) => n.id)).toEqual(["sc-1"]);
  });

  it("collects scenes at multiple nesting levels", () => {
    const nodes = [
      makeNode("part-1", "PART", undefined, [
        makeNode("ch-1", "CHAPTER", undefined, [
          makeNode("sc-1", "SCENE", "<p>Content A</p>"),
          makeNode("sc-2", "SCENE", "<p>Content B</p>"),
        ]),
      ]),
      makeNode("sc-3", "SCENE", "<p>Top-level scene</p>"),
    ];
    const result = collectSceneNodes(nodes);
    expect(result.map((n) => n.id)).toEqual(["sc-1", "sc-2", "sc-3"]);
  });

  it("returns empty array when there are no non-empty scenes", () => {
    const nodes = [
      makeNode("ch-1", "CHAPTER", undefined, [
        makeNode("sc-1", "SCENE", "<p></p>"),
      ]),
    ];
    const result = collectSceneNodes(nodes);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(collectSceneNodes([])).toHaveLength(0);
  });
});
