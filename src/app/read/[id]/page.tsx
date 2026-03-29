import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth";
import { ReaderView } from "./reader-view";

interface OutlineNode {
  id: string;
  type: string;
  title: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
}

async function getManuscriptData(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      author: true,
      genre: true,
      synopsis: true,
    },
  });

  if (!project) return null;

  const nodes = await prisma.structureNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });

  // Batch: get latest content for all scenes in one query
  // Only include scenes that are DRAFT or above (exclude OUTLINE)
  const sceneIds = nodes
    .filter((n) => n.type === "SCENE" && n.status !== "OUTLINE")
    .map((n) => n.id);
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

  // Build tree
  const nodeMap = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  // Exclude OUTLINE scenes from the tree entirely
  const visibleNodes = nodes.filter(
    (n) => n.type !== "SCENE" || n.status !== "OUTLINE"
  );

  for (const node of visibleNodes) {
    nodeMap.set(node.id, {
      id: node.id,
      type: node.type,
      title: node.title,
      orderIndex: node.orderIndex,
      parentId: node.parentId,
      children: [],
      content: contentMap[node.id],
    });
  }

  for (const node of visibleNodes) {
    const outlineNode = nodeMap.get(node.id)!;
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(outlineNode);
    } else {
      roots.push(outlineNode);
    }
  }

  // Sort children
  for (const node of nodeMap.values()) {
    if (node.children.length > 1) {
      node.children.sort((a, b) => a.orderIndex - b.orderIndex);
    }
  }
  roots.sort((a, b) => a.orderIndex - b.orderIndex);

  return { project, outline: roots };
}

async function checkReaderAccess(
  projectId: string,
  userId: string | null
): Promise<boolean> {
  // In dev/API_TOKEN mode (no userId), allow access
  if (!userId) return true;

  // Check if user owns the project
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });

  if (!project) return false;
  if (project.userId === userId) return true;

  // Look up user's email to check shares via ProjectShare
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) return false;

  const shareByEmail = await prisma.projectShare.findUnique({
    where: {
      projectId_email: {
        projectId,
        email: user.email,
      },
    },
  });

  return !!shareByEmail;
}

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  // Get user ID from headers (set by middleware)
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  // If auth is enabled and no user, redirect to login
  if (isAuthEnabled() && !userId) {
    redirect(`/login?from=/read/${projectId}`);
  }

  // Check access
  const hasAccess = await checkReaderAccess(projectId, userId);
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold text-text-primary">
            Access Denied
          </h1>
          <p className="text-text-muted">
            You do not have permission to view this manuscript.
          </p>
        </div>
      </div>
    );
  }

  const data = await getManuscriptData(projectId);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold text-text-primary">
            Not Found
          </h1>
          <p className="text-text-muted">This project does not exist.</p>
        </div>
      </div>
    );
  }

  return <ReaderView project={data.project} outline={data.outline} />;
}
