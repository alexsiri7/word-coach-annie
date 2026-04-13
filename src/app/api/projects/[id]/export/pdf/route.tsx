import { NextRequest, NextResponse } from "next/server";
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

interface OutlineNode {
  id: string;
  type: string;
  title: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
}

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

async function buildOutlineTree(projectId: string): Promise<OutlineNode[]> {
  const nodes = await prisma.structureNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });

  const sceneIds = nodes
    .filter((n: { type: string }) => n.type === "SCENE")
    .map((n: { id: string }) => n.id);
  const contentMap: Record<string, string> = {};

  if (sceneIds.length > 0) {
    const allVersions = await prisma.contentVersion.findMany({
      where: { nodeId: { in: sceneIds } },
      orderBy: { createdAt: "desc" },
      select: { nodeId: true, content: true },
    });

    for (const v of allVersions) {
      if (!(v.nodeId in contentMap)) {
        contentMap[v.nodeId] = v.content;
      }
    }
  }

  const nodeMap = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  for (const node of nodes) {
    nodeMap.set(node.id, {
      ...node,
      children: [],
      content: contentMap[node.id],
    });
  }

  for (const node of nodes) {
    const outlineNode = nodeMap.get(node.id)!;
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(outlineNode);
    } else {
      roots.push(outlineNode);
    }
  }

  return roots;
}

const styles = StyleSheet.create({
  page: { padding: 50, fontFamily: "Helvetica", fontSize: 12 },
  titlePage: {
    padding: 50,
    fontFamily: "Helvetica",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 28, marginBottom: 20, textAlign: "center" },
  author: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  partTitle: { fontSize: 20, marginTop: 30, marginBottom: 15 },
  chapterTitle: { fontSize: 16, marginTop: 20, marginBottom: 10 },
  body: { fontSize: 12, lineHeight: 1.6, marginBottom: 8 },
});

function renderOutlineNodes(nodes: OutlineNode[]): React.JSX.Element[] {
  const elements: React.JSX.Element[] = [];

  function walk(node: OutlineNode) {
    if (node.type === "PART") {
      elements.push(
        <Text key={`part-${node.id}`} style={styles.partTitle}>
          {node.title}
        </Text>
      );
      for (const child of node.children) walk(child);
    } else if (node.type === "CHAPTER") {
      elements.push(
        <Text key={`ch-${node.id}`} style={styles.chapterTitle}>
          {node.title}
        </Text>
      );
      for (const child of node.children) walk(child);
    } else if (node.type === "SCENE" && node.content) {
      const text = stripHtml(node.content);
      if (text) {
        elements.push(
          <Text key={`scene-${node.id}`} style={styles.body}>
            {text}
          </Text>
        );
      }
    }
  }

  for (const node of nodes) walk(node);
  return elements;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const userEmail = request.headers.get("x-user-email");
    const access = await verifyProjectReadAccess(id, userId, userEmail);
    if (!access.authorized) return access.response;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const outline = await buildOutlineTree(id);
    const contentElements = renderOutlineNodes(outline);

    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4" style={styles.titlePage}>
          <View>
            <Text style={styles.title}>{project.title}</Text>
            {project.author && (
              <Text style={styles.author}>{project.author}</Text>
            )}
          </View>
        </Page>
        <Page size="A4" style={styles.page}>
          {contentElements.map((el) => el)}
        </Page>
      </Document>
    );

    const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("GET /api/projects/[id]/export/pdf error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
