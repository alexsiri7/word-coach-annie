import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";

const BEAT_REGEX = /<!-- beat: ([\s\S]*?) -->/g;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectAccess(projectId, userId);
  if (!access.authorized) return access.response;

  // Get all scene nodes for this project
  const scenes = await prisma.structureNode.findMany({
    where: { projectId, type: "SCENE" },
    select: { id: true },
  });

  if (scenes.length === 0) {
    return NextResponse.json([]);
  }

  // Get the latest content version for each scene
  const latestVersions = await prisma.contentVersion.findMany({
    where: { nodeId: { in: scenes.map((s) => s.id) } },
    orderBy: { createdAt: "desc" },
    select: { nodeId: true, content: true, createdAt: true },
  });

  // Deduplicate: keep only the latest per nodeId
  const latestByNode = new Map<string, string>();
  for (const v of latestVersions) {
    if (!latestByNode.has(v.nodeId)) {
      latestByNode.set(v.nodeId, v.content);
    }
  }

  // Extract beats from each scene's content
  const result: { sceneId: string; beats: string[] }[] = [];
  for (const scene of scenes) {
    const content = latestByNode.get(scene.id);
    if (!content) continue;

    const beats: string[] = [];
    let match: RegExpExecArray | null;
    BEAT_REGEX.lastIndex = 0;
    while ((match = BEAT_REGEX.exec(content)) !== null) {
      // Strip HTML tags from beat content for plain text display
      const plain = match[1].replace(/<[^>]+>/g, "").trim();
      if (plain) beats.push(plain);
    }

    if (beats.length > 0) {
      result.push({ sceneId: scene.id, beats });
    }
  }

  return NextResponse.json(result);
}
