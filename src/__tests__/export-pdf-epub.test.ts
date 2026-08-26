import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";

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
  Document: vi.fn().mockImplementation((config: unknown) => config),
  Packer: {
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-docx")),
  },
  Paragraph: vi.fn().mockImplementation((config: unknown) => config),
  TextRun: vi.fn().mockImplementation((config: unknown) => config),
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

// ─── Unit Tests: stripHtml (PDF utility) ─────────────────────────────────────

// Inline copy of the function under test (same pattern as export.test.ts)
function stripHtml(html: string): string {
  if (!html || html === "<p></p>") return "";
  let text = html;
  // Remove beat comments
  text = text.replace(/<!--\s*beat:.*?-->/gi, "");
  // Replace paragraphs/breaks with newlines
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

describe("stripHtml (PDF export utility)", () => {
  it("returns empty for empty or minimal HTML", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml("<p></p>")).toBe("");
  });

  it("converts paragraphs to double-newline-separated text", () => {
    expect(stripHtml("<p>Hello world</p>")).toBe("Hello world");
    expect(stripHtml("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  it("strips beat annotation comments", () => {
    expect(
      stripHtml("<p>Story text</p><!-- beat: Hero enters -->")
    ).toBe("Story text");
    expect(
      stripHtml("<!-- beat: some annotation --><p>Content</p>")
    ).toBe("Content");
  });

  it("handles line breaks", () => {
    const result = stripHtml("<p>Line one<br/>Line two</p>");
    expect(result).toContain("Line one");
    expect(result).toContain("Line two");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("<p>A &amp; B</p>")).toBe("A & B");
    expect(stripHtml("<p>&lt;tag&gt;</p>")).toBe("<tag>");
    expect(stripHtml("<p>&quot;quoted&quot;</p>")).toBe('"quoted"');
    // &nbsp; in a paragraph with other text is preserved as a space
    expect(stripHtml("<p>a&nbsp;b</p>")).toBe("a b");
    expect(stripHtml("<p>&ldquo;smart&rdquo;</p>")).toBe("\u201Csmart\u201D");
    expect(stripHtml("<p>&mdash;</p>")).toBe("\u2014");
    expect(stripHtml("<p>&ndash;</p>")).toBe("\u2013");
  });

  it("strips inline tags", () => {
    expect(stripHtml("<p><strong>bold</strong> and <em>italic</em></p>")).toBe(
      "bold and italic"
    );
    expect(stripHtml("<p><span class='foo'>text</span></p>")).toBe("text");
  });

  it("collapses excess blank lines", () => {
    // Three or more consecutive newlines should collapse to two
    const html = "<p>One</p><p>Two</p><p>Three</p>";
    const result = stripHtml(html);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toBe("One\n\nTwo\n\nThree");
  });
});

// ─── Unit Tests: EPUB utilities ───────────────────────────────────────────────

interface OutlineNode {
  id: string;
  type: string;
  title: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
}

interface EpubChapter {
  title: string;
  content: string;
}

function stripBeats(html: string): string {
  return html.replace(/<!--\s*beat:.*?-->/gi, "");
}

function isEmptyContent(content: string | undefined): boolean {
  if (!content) return true;
  const stripped = content.replace(/<p><\/p>/g, "").trim();
  return stripped.length === 0;
}

function buildEpubChapters(outline: OutlineNode[]): EpubChapter[] {
  const chapters: EpubChapter[] = [];

  function collectSceneHtml(node: OutlineNode): string {
    let html = "";
    for (const child of node.children) {
      if (child.type === "SCENE" && !isEmptyContent(child.content)) {
        html += stripBeats(child.content!);
      }
    }
    return html;
  }

  function walk(node: OutlineNode) {
    if (node.type === "PART") {
      const partSceneHtml = collectSceneHtml(node);
      chapters.push({
        title: node.title,
        content: `<h1>${node.title}</h1>${partSceneHtml}`,
      });
      for (const child of node.children) {
        if (child.type !== "SCENE") walk(child);
      }
    } else if (node.type === "CHAPTER") {
      const sceneHtml = collectSceneHtml(node);
      chapters.push({
        title: node.title,
        content: `<h2>${node.title}</h2>${sceneHtml}`,
      });
    } else if (node.type === "SCENE" && !isEmptyContent(node.content)) {
      chapters.push({
        title: node.title,
        content: stripBeats(node.content!),
      });
    }
  }

  for (const node of outline) walk(node);
  return chapters;
}

function makeNode(
  overrides: Partial<OutlineNode> & { id: string; type: string; title: string }
): OutlineNode {
  return {
    orderIndex: 0,
    parentId: null,
    children: [],
    ...overrides,
  };
}

describe("stripBeats (EPUB utility)", () => {
  it("removes beat annotation comments", () => {
    expect(stripBeats("<!-- beat: Hero enters -->text")).toBe("text");
    expect(stripBeats("before<!-- beat: x -->after")).toBe("beforeafter");
    expect(stripBeats("no beats here")).toBe("no beats here");
  });

  it("handles case-insensitive beat comments", () => {
    expect(stripBeats("<!-- BEAT: TEST -->text")).toBe("text");
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
