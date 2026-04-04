import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PeerReview {
  perspective: string;
  name: string;
  content: string;
}

export interface PeerReviewResult {
  reviews: PeerReview[];
  consensus: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface OutlineNode {
  id: string;
  type: string;
  title: string;
  synopsis: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
}

function htmlToText(html: string): string {
  if (!html || html === "<p></p>") return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildManuscriptText(projectId: string): Promise<string> {
  const nodes = await prisma.structureNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });

  const sceneIds = nodes.filter((n) => n.type === "SCENE").map((n) => n.id);
  const contentMap: Record<string, string> = {};

  if (sceneIds.length > 0) {
    const allVersions = await prisma.contentVersion.findMany({
      where: { nodeId: { in: sceneIds } },
      orderBy: { createdAt: "desc" },
      select: { nodeId: true, content: true },
    });
    for (const v of allVersions) {
      if (!(v.nodeId in contentMap)) contentMap[v.nodeId] = v.content;
    }
  }

  // Build tree
  const nodeMap = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  for (const node of nodes) {
    nodeMap.set(node.id, { ...(node as unknown as OutlineNode), children: [], content: contentMap[node.id] });
  }
  for (const node of nodes) {
    const outlineNode = nodeMap.get(node.id)!;
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(outlineNode);
    } else {
      roots.push(outlineNode);
    }
  }

  // Render as plain text
  const lines: string[] = [];
  let chapterNum = 0;

  function renderNode(node: OutlineNode) {
    if (node.type === "PART") {
      lines.push(`\n=== ${node.title} ===\n`);
      for (const child of node.children) renderNode(child);
    } else if (node.type === "CHAPTER") {
      chapterNum++;
      lines.push(`\nChapter ${chapterNum}: ${node.title}\n`);
      for (const child of node.children) renderNode(child);
    } else if (node.type === "SCENE") {
      const text = node.content ? htmlToText(node.content) : "";
      if (text) {
        lines.push(text);
        lines.push("\n");
      }
    }
  }

  for (const node of roots) renderNode(node);
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

// ─── Persona prompts ──────────────────────────────────────────────────────────

const PERSONAS = [
  {
    key: "publisher",
    name: "Publisher",
    systemPrompt:
      "You are an experienced literary publisher evaluating manuscripts for publication. You combine commercial instincts with literary sensibility.",
    userPrompt: (title: string, manuscript: string) =>
      `Read this manuscript — "${title}" — and give your publisher's assessment in ~400 words.

Address:
- Would you publish this? Why or why not?
- What works well commercially and literarily?
- What would you ask the author to revise before accepting?
- Where does it succeed or fail at hooking readers and sustaining momentum?

Be honest and specific. Reference the actual text.

---

${manuscript}`,
  },
  {
    key: "reader",
    name: "Avid Reader",
    systemPrompt:
      "You are an avid reader who reads widely and voraciously. You give honest reader reactions based on your experience as a passionate, critical reader.",
    userPrompt: (title: string, manuscript: string) =>
      `Read this manuscript — "${title}" — and give your reader's honest reaction in ~400 words.

Address:
- Did it hook you? Did you want to keep reading?
- What stayed with you? What felt weak or forgettable?
- Were the characters compelling? Did you care what happened to them?
- What would you tell a friend about this story?

Be honest and specific. Reference the actual text.

---

${manuscript}`,
  },
  {
    key: "writer",
    name: "Experienced Writer",
    systemPrompt:
      "You are an experienced writer and writing teacher who gives craft-focused feedback. You focus on technique, not taste.",
    userPrompt: (title: string, manuscript: string) =>
      `Read this manuscript — "${title}" — and give craft feedback in ~400 words.

Address:
- Voice consistency and prose style
- Pacing and scene structure
- Character work — are motivations clear and arcs present?
- World-building integration — does the setting feel inhabited?
- The ending — does it earn its resolution?

Be specific. Quote or paraphrase the text when illustrating a point.

---

${manuscript}`,
  },
];

function buildConsensusPrompt(title: string, reviews: PeerReview[]): string {
  const reviewText = reviews
    .map((r) => `## ${r.name}\n${r.content}`)
    .join("\n\n");

  return `Three reviewers read "${title}" independently. Here are their reviews:

${reviewText}

---

Write a concise consensus synthesis (~300 words) that:
1. Identifies the 2-3 things all three reviewers agreed on (strengths or weaknesses)
2. Notes where they disagreed and why the perspectives differ
3. Highlights the single most important thing the author should address

Format as clear prose, not bullet points. Be direct.`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectReadAccess(id, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI provider not configured. Set API key in AI Settings." },
        { status: 503 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const manuscript = await buildManuscriptText(id);
    if (!manuscript) {
      return NextResponse.json(
        { error: "No manuscript content found. Add some scenes first." },
        { status: 400 }
      );
    }

    // Run all three reviewer agents in parallel via ADK
    const reviewPromises = PERSONAS.map((persona) =>
      runSimpleCompletion({
        systemPrompt: persona.systemPrompt,
        userMessage: persona.userPrompt(project.title, manuscript),
        aiConfig,
        maxTokens: 700,
        temperature: 0.7,
      }).then((content) => ({
        perspective: persona.key,
        name: persona.name,
        content,
      }))
    );

    const reviews = await Promise.all(reviewPromises);

    // Run consensus synthesis
    const consensus = await runSimpleCompletion({
      systemPrompt:
        "You are a senior editor synthesizing feedback from multiple reviewers into a clear, actionable consensus.",
      userMessage: buildConsensusPrompt(project.title, reviews),
      aiConfig,
      maxTokens: 500,
      temperature: 0.5,
    });

    const result: PeerReviewResult = { reviews, consensus };
    return NextResponse.json(result);
  } catch (error) {
    logger.error("POST /api/projects/[id]/peer-review error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
