import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";
import { buildEpubChapters, isEmptyContent } from "@/lib/epub-chapters";
import { sceneHtmlToPlainText, stripBeats } from "@/lib/scene-text";
import type { OutlineNode } from "@/lib/outline-tree";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
  // Use simple function components so JSX compiles without error in test env
  Document: ({ children }: { children?: unknown }) => children,
  Page: ({ children }: { children?: unknown }) => children,
  Text: ({ children }: { children?: unknown }) => children,
  View: ({ children }: { children?: unknown }) => children,
  StyleSheet: { create: (s: object) => s },
}));

// React must be in scope for JSX to work in the pdf route (tsx file uses React.createElement)
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return actual;
});

vi.mock("epub-gen-memory", () => ({
  default: vi.fn().mockResolvedValue(Buffer.from("fake-epub")),
}));

vi.mock("docx", () => ({
  Document: vi.fn().mockImplementation(function (config: unknown) { return config; }),
  Packer: {
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-docx")),
  },
  Paragraph: vi.fn().mockImplementation(function (config: unknown) { return config; }),
  TextRun: vi.fn().mockImplementation(function (config: unknown) { return config; }),
  AlignmentType: { LEFT: "left" },
}));

class MockNextRequest {
  private _url: string;
  nextUrl: { searchParams: URLSearchParams };
  headers: Map<string, string>;

  constructor(
    url: string,
    init?: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    }
  ) {
    this._url = url;
    this.nextUrl = {
      searchParams: new URL(url, "http://localhost").searchParams,
    };
    this.headers = new Map();
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        this.headers.set(k, v);
      }
    }
  }

  get(key: string): string | null {
    return this.headers.get(key) ?? null;
  }
}

vi.mock("next/server", () => {
  class MockResp {
    status: number;
    _data: unknown;
    _headers: Record<string, string>;
    constructor(
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) {
      this._data = body;
      this.status = init?.status || 200;
      this._headers = init?.headers || {};
    }
    async json() {
      return this._data;
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: Object.assign(
      function (
        body: unknown,
        init?: { status?: number; headers?: Record<string, string> }
      ) {
        return new MockResp(body, init);
      } as object,
      {
        json: (data: unknown, init?: { status?: number }) => {
          const r = new MockResp(data, init);
          r._data = data;
          return r;
        },
      }
    ),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockParams<T>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

function makeRequest(
  url: string,
  opts?: {
    userId?: string;
    userEmail?: string;
  }
) {
  const headers: Record<string, string> = {};
  if (opts?.userId) headers["x-user-id"] = opts.userId;
  if (opts?.userEmail) headers["x-user-email"] = opts.userEmail;
  return new MockNextRequest(url, { headers });
}

async function createOwnerAndProject(suffix: string = "") {
  const id = `${crypto.randomUUID()}-${suffix}`;
  const owner = await testPrisma.user.create({
    data: { email: `owner-${id}@example.com`, googleId: `google-owner-${id}`, name: "Owner" },
  });
  const project = await testPrisma.project.create({
    data: { title: "My Novel", author: "Owner", userId: owner.id },
  });
  return { owner, project };
}

// ─── Unit Tests: sceneHtmlToPlainText (PDF/DOCX utility) ─────────────────────

describe("sceneHtmlToPlainText (PDF/DOCX export utility)", () => {
  it("returns empty for empty or minimal HTML", () => {
    expect(sceneHtmlToPlainText("")).toBe("");
    expect(sceneHtmlToPlainText("<p></p>")).toBe("");
  });

  it("converts paragraphs to double-newline-separated text", () => {
    expect(sceneHtmlToPlainText("<p>Hello world</p>")).toBe("Hello world");
    expect(sceneHtmlToPlainText("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  it("strips beat annotation comments", () => {
    expect(
      sceneHtmlToPlainText("<p>Story text</p><!-- beat: Hero enters -->")
    ).toBe("Story text");
    expect(
      sceneHtmlToPlainText("<!-- beat: some annotation --><p>Content</p>")
    ).toBe("Content");
  });

  it("strips multi-line beat comments", () => {
    expect(
      sceneHtmlToPlainText("<p>Story text</p><!-- beat: Hero enters >\nthe killer watches -->")
    ).toBe("Story text");
  });

  it("strips beat annotation divs", () => {
    expect(
      sceneHtmlToPlainText('<p>In.</p><div data-type="beat-annotation">killer is the butler</div><p>Out.</p>')
    ).toBe("In.\n\nOut.");
  });

  it("handles line breaks", () => {
    const result = sceneHtmlToPlainText("<p>Line one<br/>Line two</p>");
    expect(result).toContain("Line one");
    expect(result).toContain("Line two");
  });

  it("decodes common HTML entities", () => {
    expect(sceneHtmlToPlainText("<p>A &amp; B</p>")).toBe("A & B");
    expect(sceneHtmlToPlainText("<p>&lt;tag&gt;</p>")).toBe("<tag>");
    expect(sceneHtmlToPlainText("<p>&quot;quoted&quot;</p>")).toBe('"quoted"');
    // &nbsp; in a paragraph with other text is preserved as a space
    expect(sceneHtmlToPlainText("<p>a&nbsp;b</p>")).toBe("a b");
    expect(sceneHtmlToPlainText("<p>&ldquo;smart&rdquo;</p>")).toBe("\u201Csmart\u201D");
    expect(sceneHtmlToPlainText("<p>&mdash;</p>")).toBe("\u2014");
    expect(sceneHtmlToPlainText("<p>&ndash;</p>")).toBe("\u2013");
  });

  it("decodes an escaped entity only once", () => {
    expect(sceneHtmlToPlainText("<p>&amp;lt;b&amp;gt; and &amp;amp;</p>")).toBe("&lt;b&gt; and &amp;");
  });

  it("strips inline tags", () => {
    expect(sceneHtmlToPlainText("<p><strong>bold</strong> and <em>italic</em></p>")).toBe(
      "bold and italic"
    );
    expect(sceneHtmlToPlainText("<p><span class='foo'>text</span></p>")).toBe("text");
  });

  it("collapses excess blank lines", () => {
    // Three or more consecutive newlines should collapse to two
    const html = "<p>One</p><p>Two</p><p>Three</p>";
    const result = sceneHtmlToPlainText(html);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toBe("One\n\nTwo\n\nThree");
  });
});

// ─── Unit Tests: EPUB utilities ───────────────────────────────────────────────

function makeNode(
  overrides: Partial<OutlineNode> & { id: string; type: string; title: string }
): OutlineNode {
  return {
    synopsis: "",
    status: "DRAFT",
    orderIndex: 0,
    parentId: null,
    children: [],
    ...overrides,
  };
}

describe("stripBeats", () => {
  it("removes beat annotation comments", () => {
    expect(stripBeats("<!-- beat: Hero enters -->text")).toBe("text");
    expect(stripBeats("before<!-- beat: x -->after")).toBe("beforeafter");
    expect(stripBeats("no beats here")).toBe("no beats here");
  });

  it("handles case-insensitive beat comments", () => {
    expect(stripBeats("<!-- BEAT: TEST -->text")).toBe("text");
  });

  it("removes beat annotation divs", () => {
    expect(
      stripBeats('<p>In.</p><div data-type="beat-annotation">killer is the butler</div><p>Out.</p>')
    ).toBe("<p>In.</p><p>Out.</p>");
  });
});

describe("isEmptyContent (EPUB utility)", () => {
  it("returns true for undefined/null-like", () => {
    expect(isEmptyContent(undefined)).toBe(true);
    expect(isEmptyContent("")).toBe(true);
  });

  it("returns true for empty paragraph tags only", () => {
    expect(isEmptyContent("<p></p>")).toBe(true);
    expect(isEmptyContent("<p></p><p></p>")).toBe(true);
  });

  it("returns false for content with text", () => {
    expect(isEmptyContent("<p>Hello world</p>")).toBe(false);
    expect(isEmptyContent("<p>A</p>")).toBe(false);
  });

  it("returns false for content with only whitespace in paragraphs", () => {
    // Content with actual text (not just empty <p> tags) should be included
    expect(isEmptyContent("<p> </p>")).toBe(false);
  });
});

describe("buildEpubChapters", () => {
  it("handles empty outline", () => {
    expect(buildEpubChapters([])).toEqual([]);
  });

  it("handles PART with no direct scenes (title-only chapter)", () => {
    const part = makeNode({ id: "p1", type: "PART", title: "Part One", children: [] });
    const chapters = buildEpubChapters([part]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Part One");
    expect(chapters[0].content).toBe("<h1>Part One</h1>");
  });

  it("handles PART with direct scene children (title + scenes chapter)", () => {
    const scene = makeNode({
      id: "s1",
      type: "SCENE",
      title: "Scene 1",
      parentId: "p1",
      content: "<p>Scene content</p>",
    });
    const part = makeNode({
      id: "p1",
      type: "PART",
      title: "Part One",
      children: [scene],
    });
    const chapters = buildEpubChapters([part]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].content).toBe("<h1>Part One</h1><p>Scene content</p>");
  });

  it("handles PART → CHAPTER → SCENE hierarchy", () => {
    const scene = makeNode({
      id: "s1",
      type: "SCENE",
      title: "Scene 1",
      parentId: "c1",
      content: "<p>Scene text</p>",
    });
    const chapter = makeNode({
      id: "c1",
      type: "CHAPTER",
      title: "Chapter One",
      parentId: "p1",
      children: [scene],
    });
    const part = makeNode({
      id: "p1",
      type: "PART",
      title: "Part One",
      children: [chapter],
    });
    const chapters = buildEpubChapters([part]);
    // Part (title-only) + Chapter (with scene)
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe("Part One");
    expect(chapters[0].content).toBe("<h1>Part One</h1>");
    expect(chapters[1].title).toBe("Chapter One");
    expect(chapters[1].content).toBe("<h2>Chapter One</h2><p>Scene text</p>");
  });

  it("handles top-level orphan scenes (no parent chapter)", () => {
    const scene = makeNode({
      id: "s1",
      type: "SCENE",
      title: "Orphan Scene",
      content: "<p>Orphan content</p>",
    });
    const chapters = buildEpubChapters([scene]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Orphan Scene");
    expect(chapters[0].content).toBe("<p>Orphan content</p>");
  });

  it("excludes top-level scenes with empty content", () => {
    const emptyScene = makeNode({
      id: "s1",
      type: "SCENE",
      title: "Empty Scene",
      content: "<p></p>",
    });
    const chapters = buildEpubChapters([emptyScene]);
    expect(chapters).toHaveLength(0);
  });

  it("excludes child scenes with empty content from chapters", () => {
    const emptyScene = makeNode({
      id: "s1",
      type: "SCENE",
      title: "Empty",
      parentId: "c1",
      content: "<p></p>",
    });
    const filledScene = makeNode({
      id: "s2",
      type: "SCENE",
      title: "Filled",
      parentId: "c1",
      content: "<p>Real content</p>",
    });
    const chapter = makeNode({
      id: "c1",
      type: "CHAPTER",
      title: "Chapter One",
      children: [emptyScene, filledScene],
    });
    const chapters = buildEpubChapters([chapter]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].content).toContain("Real content");
    expect(chapters[0].content).not.toContain("<p></p>");
  });

  it("strips beat annotations from scene content", () => {
    const scene = makeNode({
      id: "s1",
      type: "SCENE",
      title: "Scene",
      content: "<!-- beat: Hero enters --><p>Story text</p>",
    });
    const chapters = buildEpubChapters([scene]);
    expect(chapters[0].content).not.toContain("beat:");
    expect(chapters[0].content).toContain("Story text");
  });

  it("strips div-format beats from scene content", () => {
    const scene = makeNode({
      id: "s1",
      type: "SCENE",
      title: "Scene",
      content: '<p>Story text</p><div data-type="beat-annotation">killer is the butler</div>',
    });
    const chapters = buildEpubChapters([scene]);
    expect(chapters[0].content).not.toContain("butler");
    expect(chapters[0].content).toContain("Story text");
  });

  it("sanitizes stored scene HTML before it reaches the chapter", () => {
    const chapter = makeNode({
      id: "c1",
      type: "CHAPTER",
      title: "Ch",
      children: [
        makeNode({
          id: "s1",
          type: "SCENE",
          title: "Scene",
          content: '<p>Kept</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
        }),
      ],
    });
    const orphan = makeNode({
      id: "s2",
      type: "SCENE",
      title: "Orphan",
      content: "<p>Also kept</p><scr<!-- beat: x -->ipt>alert(3)</script>",
    });
    const chapters = buildEpubChapters([chapter, orphan]);
    for (const { content } of chapters) {
      expect(content).not.toMatch(/<script|onerror/i);
    }
    expect(chapters[0].content).toContain("<p>Kept</p>");
    expect(chapters[1].content).toContain("<p>Also kept</p>");
  });
});

// ─── Integration Tests: Auth and 404 handling ─────────────────────────────────

describe("GET /api/projects/[id]/export/pdf — auth and 404", () => {
  let ownerId: string;
  let projectId: string;

  beforeEach(async () => {
    const { owner, project } = await createOwnerAndProject();
    ownerId = owner.id;
    projectId = project.id;
  });

  it("returns 200 for unauthenticated request (dev/API_TOKEN mode)", async () => {
    // When userId is null, verifyProjectReadAccess allows access (dev/API_TOKEN mode)
    const { GET } = await import(
      "@/app/api/projects/[id]/export/pdf/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/pdf`);
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });

  it("returns 403 for non-owner user", async () => {
    const ts = Date.now();
    const other = await testPrisma.user.create({
      data: { email: `other-pdf-${ts}@example.com`, googleId: `google-other-pdf-${ts}`, name: "Other" },
    });
    const { GET } = await import(
      "@/app/api/projects/[id]/export/pdf/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/pdf`, {
      userId: other.id,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(403);
  });

  it("returns 404 for non-existent project", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/export/pdf/route"
    );
    const req = makeRequest(
      `http://localhost/api/projects/nonexistent/export/pdf`,
      { userId: ownerId }
    );
    const res = await GET(req as never, mockParams({ id: "nonexistent" }));
    expect((res as any).status).toBeGreaterThanOrEqual(404);
  });

  it("returns 200 with PDF for project owner", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/export/pdf/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/pdf`, {
      userId: ownerId,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });

  it("shared reader can download PDF", async () => {
    const ts = Date.now();
    const readerEmail = `reader-pdf-${ts}@example.com`;
    const reader = await testPrisma.user.create({
      data: { email: readerEmail, googleId: `google-reader-pdf-${ts}`, name: "Reader" },
    });
    await testPrisma.projectShare.create({
      data: { projectId, email: readerEmail, role: "READER" },
    });

    const { GET } = await import(
      "@/app/api/projects/[id]/export/pdf/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/pdf`, {
      userId: reader.id,
      userEmail: readerEmail,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });
});

describe("GET /api/projects/[id]/export/epub — auth and 404", () => {
  let ownerId: string;
  let projectId: string;

  beforeEach(async () => {
    const { owner, project } = await createOwnerAndProject();
    ownerId = owner.id;
    projectId = project.id;
  });

  it("returns 200 for unauthenticated request (dev/API_TOKEN mode)", async () => {
    // When userId is null, verifyProjectReadAccess allows access (dev/API_TOKEN mode)
    const { GET } = await import(
      "@/app/api/projects/[id]/export/epub/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/epub`);
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });

  it("returns 403 for non-owner user", async () => {
    const ts = Date.now();
    const other = await testPrisma.user.create({
      data: { email: `other-epub-${ts}@example.com`, googleId: `google-other-epub-${ts}`, name: "Other2" },
    });
    const { GET } = await import(
      "@/app/api/projects/[id]/export/epub/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/epub`, {
      userId: other.id,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(403);
  });

  it("returns 404 for non-existent project", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/export/epub/route"
    );
    const req = makeRequest(
      `http://localhost/api/projects/nonexistent/export/epub`,
      { userId: ownerId }
    );
    const res = await GET(req as never, mockParams({ id: "nonexistent" }));
    expect((res as any).status).toBeGreaterThanOrEqual(404);
  });

  it("returns 200 with EPUB for project owner", async () => {
    const { GET } = await import(
      "@/app/api/projects/[id]/export/epub/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/epub`, {
      userId: ownerId,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });

  it("shared reader can download EPUB", async () => {
    const ts = Date.now();
    const readerEmail = `reader-epub-${ts}@example.com`;
    const reader = await testPrisma.user.create({
      data: {
        email: readerEmail,
        googleId: `google-reader-epub-${ts}`,
        name: "Reader2",
      },
    });
    await testPrisma.projectShare.create({
      data: { projectId, email: readerEmail, role: "READER" },
    });

    const { GET } = await import(
      "@/app/api/projects/[id]/export/epub/route"
    );
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/epub`, {
      userId: reader.id,
      userEmail: readerEmail,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });
});

// Each renderer is mocked, so its last call holds everything the route put in the file.
const renderedInput = {
  epub: async () => ((await import("epub-gen-memory")).default as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1],
  docx: async () => ((await import("docx")).Packer.toBuffer as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0],
  pdf: async () => ((await import("@react-pdf/renderer")).renderToBuffer as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0],
};
const routes = {
  epub: () => import("@/app/api/projects/[id]/export/epub/route"),
  docx: () => import("@/app/api/projects/[id]/export/docx/route"),
  pdf: () => import("@/app/api/projects/[id]/export/pdf/route"),
};
type Format = keyof typeof routes;

async function exportedText(
  projectId: string,
  format: Format,
  opts?: { userId?: string; userEmail?: string }
) {
  const { GET } = await routes[format]();
  const req = makeRequest(`http://localhost/api/projects/${projectId}/export/${format}`, opts);
  const res = await GET(req as never, mockParams({ id: projectId }));
  expect(res.status).toBe(200);
  return JSON.stringify(await renderedInput[format]());
}

describe("READER exports omit outline scenes", () => {
  let ownerId: string;
  let projectId: string;

  beforeEach(async () => {
    const { owner, project } = await createOwnerAndProject();
    ownerId = owner.id;
    projectId = project.id;
    const chapter = await testPrisma.structureNode.create({
      data: { projectId, type: "CHAPTER", title: "Chapter One", orderIndex: 0 },
    });
    const outlined = await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Planned", orderIndex: 0 },
    });
    const drafted = await testPrisma.structureNode.create({
      data: { projectId, parentId: chapter.id, type: "SCENE", title: "Written", orderIndex: 1, status: "DRAFT" },
    });
    await testPrisma.contentVersion.createMany({
      data: [
        { nodeId: outlined.id, content: "<p>Private beat notes</p>", wordCount: 3 },
        { nodeId: drafted.id, content: "<p>Finished prose</p>", wordCount: 2 },
      ],
    });
  });

  it("buildOutlineTree keeps outline scenes unless asked to exclude them", async () => {
    const { buildOutlineTree } = await import("@/lib/outline-tree");
    const sceneTitles = async (excludeOutlineScenes?: boolean) =>
      (await buildOutlineTree(projectId, { excludeOutlineScenes }))[0].children.map((n) => n.title);
    expect(await sceneTitles()).toEqual(["Planned", "Written"]);
    expect(await sceneTitles(true)).toEqual(["Written"]);
  });

  it.each(Object.keys(routes) as Format[])("a READER's %s has no outline scene text", async (format) => {
    const ts = Date.now();
    const readerEmail = `reader-outline-${format}-${ts}@example.com`;
    const reader = await testPrisma.user.create({
      data: { email: readerEmail, googleId: `google-reader-outline-${format}-${ts}`, name: "Reader" },
    });
    await testPrisma.projectShare.create({
      data: { projectId, email: readerEmail, role: "READER" },
    });
    const text = await exportedText(projectId, format, { userId: reader.id, userEmail: readerEmail });
    expect(text).toContain("Finished prose");
    expect(text).not.toContain("Private beat notes");
  });

  it.each(Object.keys(routes) as Format[])("the owner's %s still includes outline scene text", async (format) => {
    const text = await exportedText(projectId, format, { userId: ownerId });
    expect(text).toContain("Finished prose");
    expect(text).toContain("Private beat notes");
  });
});

describe("PDF and DOCX exports strip beats", () => {
  const beatScenes = {
    "a beat annotation div": '<p>Visible prose</p><div data-type="beat-annotation">killer is the butler</div>',
    "a multi-line beat comment": "<p>Visible prose</p><!-- beat: suspect the maid >\nthe killer is the butler -->",
  };

  it.each((["pdf", "docx"] as const).flatMap((format) =>
    Object.keys(beatScenes).map((form) => [format, form] as const)
  ))("%s export omits %s", async (format, form) => {
    const { owner, project } = await createOwnerAndProject();
    const scene = await testPrisma.structureNode.create({
      data: { projectId: project.id, type: "SCENE", title: "Scene", orderIndex: 0, status: "DRAFT" },
    });
    await testPrisma.contentVersion.create({
      data: { nodeId: scene.id, content: beatScenes[form as keyof typeof beatScenes], wordCount: 2 },
    });
    const text = await exportedText(project.id, format, { userId: owner.id });
    expect(text).toContain("Visible prose");
    expect(text).not.toContain("butler");
  });
});

describe("GET /api/projects/[id]/export/docx — auth and 404", () => {
  let ownerId: string;
  let projectId: string;

  beforeEach(async () => {
    const { owner, project } = await createOwnerAndProject();
    ownerId = owner.id;
    projectId = project.id;
  });

  it("returns 200 for unauthenticated request (dev/API_TOKEN mode)", async () => {
    const { GET } = await import("@/app/api/projects/[id]/export/docx/route");
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/docx`);
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });

  it("returns 403 for non-owner user", async () => {
    const ts = Date.now();
    const other = await testPrisma.user.create({
      data: { email: `other-docx-${ts}@example.com`, googleId: `google-other-docx-${ts}`, name: "Other3" },
    });
    const { GET } = await import("@/app/api/projects/[id]/export/docx/route");
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/docx`, {
      userId: other.id,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(403);
  });

  it("returns 404 for non-existent project", async () => {
    const { GET } = await import("@/app/api/projects/[id]/export/docx/route");
    const req = makeRequest(
      `http://localhost/api/projects/nonexistent/export/docx`,
      { userId: ownerId }
    );
    const res = await GET(req as never, mockParams({ id: "nonexistent" }));
    expect((res as any).status).toBeGreaterThanOrEqual(404);
  });

  it("returns 200 with DOCX for project owner", async () => {
    const { GET } = await import("@/app/api/projects/[id]/export/docx/route");
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/docx`, {
      userId: ownerId,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });

  it("shared reader can download DOCX", async () => {
    const ts = Date.now();
    const readerEmail = `reader-docx-${ts}@example.com`;
    const reader = await testPrisma.user.create({
      data: {
        email: readerEmail,
        googleId: `google-reader-docx-${ts}`,
        name: "Reader3",
      },
    });
    await testPrisma.projectShare.create({
      data: { projectId, email: readerEmail, role: "READER" },
    });
    const { GET } = await import("@/app/api/projects/[id]/export/docx/route");
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/docx`, {
      userId: reader.id,
      userEmail: readerEmail,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
  });

  it("generated buffer is non-empty (valid DOCX)", async () => {
    const { GET } = await import("@/app/api/projects/[id]/export/docx/route");
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/docx`, {
      userId: ownerId,
    });
    const res = await GET(req as never, mockParams({ id: projectId }));
    expect((res as any).status).toBe(200);
    // Packer.toBuffer mock returns Buffer.from("fake-docx") which is non-empty
    const { Packer } = await import("docx");
    expect(Packer.toBuffer).toHaveBeenCalled();
  });

  it("Paragraph children use Arial font and LEFT alignment", async () => {
    const { Paragraph, TextRun, AlignmentType } = await import("docx");
    const { GET } = await import("@/app/api/projects/[id]/export/docx/route");
    const req = makeRequest(`http://localhost/api/projects/${projectId}/export/docx`, {
      userId: ownerId,
    });
    await GET(req as never, mockParams({ id: projectId }));
    // All Paragraph calls must use AlignmentType.LEFT
    const paragraphCalls = (Paragraph as unknown as ReturnType<typeof vi.fn>).mock.calls;
    for (const [config] of paragraphCalls) {
      expect(config.alignment).toBe(AlignmentType.LEFT);
    }
    // All TextRun calls must set font: "Arial"
    const textRunCalls = (TextRun as unknown as ReturnType<typeof vi.fn>).mock.calls;
    for (const [config] of textRunCalls) {
      expect(config.font).toBe("Arial");
    }
  });
});

// ─── Unit Tests: buildDocxParagraphs ─────────────────────────────────────────

// Inline copy of the function under test.
// Keep in sync with src/app/api/projects/[id]/export/docx/route.ts
interface TestOutlineNode {
  id: string;
  type: string;
  title: string;
  orderIndex: number;
  parentId: string | null;
  children: TestOutlineNode[];
  content?: string;
}

interface TestParagraph {
  children: TestTextRun[];
  alignment: string;
}

interface TestTextRun {
  text: string;
  font: string;
  size: number;
  bold?: boolean;
}

function buildDocxParagraphsForTest(nodes: TestOutlineNode[]): TestParagraph[] {
  const paragraphs: TestParagraph[] = [];

  function walk(node: TestOutlineNode) {
    if (node.type === "PART") {
      paragraphs.push({
        children: [{ text: node.title, font: "Arial", size: 32, bold: true }],
        alignment: "left",
      });
      for (const child of node.children) walk(child);
    } else if (node.type === "CHAPTER") {
      paragraphs.push({
        children: [{ text: node.title, font: "Arial", size: 28, bold: true }],
        alignment: "left",
      });
      for (const child of node.children) walk(child);
    } else if (node.type === "SCENE" && node.content) {
      const text = sceneHtmlToPlainText(node.content);
      if (text) {
        for (const block of text.split("\n\n")) {
          const trimmed = block.trim();
          if (trimmed) {
            paragraphs.push({
              children: [{ text: trimmed, font: "Arial", size: 24 }],
              alignment: "left",
            });
          }
        }
      }
    }
  }

  for (const node of nodes) walk(node);
  return paragraphs;
}

describe("buildDocxParagraphs (DOCX export utility)", () => {
  it("emits a 32pt bold paragraph for PART nodes", () => {
    const node: TestOutlineNode = {
      id: "1", type: "PART", title: "Part One",
      orderIndex: 0, parentId: null, children: [],
    };
    const paras = buildDocxParagraphsForTest([node]);
    expect(paras).toHaveLength(1);
    expect(paras[0].children[0].text).toBe("Part One");
    expect(paras[0].children[0].font).toBe("Arial");
    expect(paras[0].children[0].size).toBe(32);
    expect(paras[0].children[0].bold).toBe(true);
    expect(paras[0].alignment).toBe("left");
  });

  it("emits a 28pt bold paragraph for CHAPTER nodes", () => {
    const node: TestOutlineNode = {
      id: "2", type: "CHAPTER", title: "Chapter One",
      orderIndex: 0, parentId: null, children: [],
    };
    const paras = buildDocxParagraphsForTest([node]);
    expect(paras).toHaveLength(1);
    expect(paras[0].children[0].text).toBe("Chapter One");
    expect(paras[0].children[0].font).toBe("Arial");
    expect(paras[0].children[0].size).toBe(28);
    expect(paras[0].children[0].bold).toBe(true);
    expect(paras[0].alignment).toBe("left");
  });

  it("emits a 24pt paragraph for SCENE content with Arial font and LEFT alignment", () => {
    const node: TestOutlineNode = {
      id: "3", type: "SCENE", title: "Scene 1",
      orderIndex: 0, parentId: null, children: [],
      content: "<p>Once upon a time.</p>",
    };
    const paras = buildDocxParagraphsForTest([node]);
    expect(paras).toHaveLength(1);
    expect(paras[0].children[0].text).toBe("Once upon a time.");
    expect(paras[0].children[0].font).toBe("Arial");
    expect(paras[0].children[0].size).toBe(24);
    expect(paras[0].children[0].bold).toBeUndefined();
    expect(paras[0].alignment).toBe("left");
  });

  it("splits SCENE content on double newlines into separate paragraphs", () => {
    const node: TestOutlineNode = {
      id: "3", type: "SCENE", title: "Scene 1",
      orderIndex: 0, parentId: null, children: [],
      content: "<p>First block</p><p>Second block</p>",
    };
    const paras = buildDocxParagraphsForTest([node]);
    expect(paras).toHaveLength(2);
    expect(paras[0].children[0].text).toBe("First block");
    expect(paras[1].children[0].text).toBe("Second block");
  });

  it("skips SCENE nodes with no content", () => {
    const node: TestOutlineNode = {
      id: "4", type: "SCENE", title: "Empty Scene",
      orderIndex: 0, parentId: null, children: [],
    };
    expect(buildDocxParagraphsForTest([node])).toHaveLength(0);
  });

  it("skips SCENE nodes with empty HTML content", () => {
    const node: TestOutlineNode = {
      id: "5", type: "SCENE", title: "Empty Para Scene",
      orderIndex: 0, parentId: null, children: [],
      content: "<p></p>",
    };
    expect(buildDocxParagraphsForTest([node])).toHaveLength(0);
  });

  it("recurses into PART children (chapters and scenes)", () => {
    const scene: TestOutlineNode = {
      id: "3", type: "SCENE", title: "Scene 1",
      orderIndex: 1, parentId: "2", children: [],
      content: "<p>Body text.</p>",
    };
    const chapter: TestOutlineNode = {
      id: "2", type: "CHAPTER", title: "Chapter One",
      orderIndex: 0, parentId: "1", children: [scene],
    };
    const part: TestOutlineNode = {
      id: "1", type: "PART", title: "Part One",
      orderIndex: 0, parentId: null, children: [chapter],
    };
    const paras = buildDocxParagraphsForTest([part]);
    // PART heading + CHAPTER heading + SCENE content
    expect(paras).toHaveLength(3);
    expect(paras[0].children[0].text).toBe("Part One");
    expect(paras[0].children[0].size).toBe(32);
    expect(paras[1].children[0].text).toBe("Chapter One");
    expect(paras[1].children[0].size).toBe(28);
    expect(paras[2].children[0].text).toBe("Body text.");
    expect(paras[2].children[0].size).toBe(24);
  });
});
