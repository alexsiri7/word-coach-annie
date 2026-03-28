import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

// GET /api/projects/[id]/progress - Get manuscript progress stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    // Get all structure nodes with status
    const nodes = await prisma.structureNode.findMany({
      where: { projectId: id },
      orderBy: [{ parentId: "asc" }, { orderIndex: "asc" }],
      select: {
        id: true,
        parentId: true,
        type: true,
        title: true,
        status: true,
        orderIndex: true,
      },
    });

    // Get latest word counts for all scenes
    const sceneIds = nodes.filter((n) => n.type === "SCENE").map((n) => n.id);
    const versions = sceneIds.length > 0
      ? await prisma.contentVersion.findMany({
          where: { nodeId: { in: sceneIds } },
          orderBy: { createdAt: "desc" },
          select: { nodeId: true, wordCount: true },
        })
      : [];

    const wordCounts = new Map<string, number>();
    for (const v of versions) {
      if (!wordCounts.has(v.nodeId)) wordCounts.set(v.nodeId, v.wordCount ?? 0);
    }

    // Build node map for tree traversal
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const parts = nodes.filter((n) => n.type === "PART");
    const chapters = nodes.filter((n) => n.type === "CHAPTER");
    const scenes = nodes.filter((n) => n.type === "SCENE");

    // Total word count and scene stats
    let totalWords = 0;
    let scenesDrafted = 0;
    const sceneStatusCounts = { OUTLINE: 0, DRAFT: 0, REVISED: 0, FINAL: 0 };

    for (const scene of scenes) {
      const wc = wordCounts.get(scene.id) || 0;
      totalWords += wc;
      const st = scene.status as keyof typeof sceneStatusCounts;
      if (st in sceneStatusCounts) sceneStatusCounts[st]++;
      if (scene.status !== "OUTLINE") scenesDrafted++;
    }

    // Get chapter word count (sum of child scenes)
    const chapterWordCounts = new Map<string, number>();
    for (const scene of scenes) {
      if (!scene.parentId) continue;
      const current = chapterWordCounts.get(scene.parentId) || 0;
      chapterWordCounts.set(scene.parentId, current + (wordCounts.get(scene.id) || 0));
    }

    // Build part progress
    const partProgress = parts.map((part) => {
      const partChapters = chapters.filter((c) => c.parentId === part.id);
      const partScenes = scenes.filter((s) => {
        const chapter = nodeMap.get(s.parentId || "");
        return chapter?.parentId === part.id;
      });

      let partWords = 0;
      let partFinal = 0;
      let partRevised = 0;
      let partDraft = 0;
      let partOutline = 0;

      for (const scene of partScenes) {
        partWords += wordCounts.get(scene.id) || 0;
        if (scene.status === "FINAL") partFinal++;
        else if (scene.status === "REVISED") partRevised++;
        else if (scene.status === "DRAFT") partDraft++;
        else partOutline++;
      }

      return {
        id: part.id,
        title: part.title,
        chapterCount: partChapters.length,
        sceneCount: partScenes.length,
        wordCount: partWords,
        statusCounts: { FINAL: partFinal, REVISED: partRevised, DRAFT: partDraft, OUTLINE: partOutline },
      };
    });

    // If no parts, treat chapters as top-level groups
    const topLevelGroups = parts.length > 0 ? partProgress : chapters.map((chapter) => {
      const chapterScenes = scenes.filter((s) => s.parentId === chapter.id);
      let chFinal = 0, chRevised = 0, chDraft = 0, chOutline = 0;
      let chWords = 0;
      for (const s of chapterScenes) {
        chWords += wordCounts.get(s.id) || 0;
        if (s.status === "FINAL") chFinal++;
        else if (s.status === "REVISED") chRevised++;
        else if (s.status === "DRAFT") chDraft++;
        else chOutline++;
      }
      return {
        id: chapter.id,
        title: chapter.title,
        chapterCount: 0,
        sceneCount: chapterScenes.length,
        wordCount: chWords,
        statusCounts: { FINAL: chFinal, REVISED: chRevised, DRAFT: chDraft, OUTLINE: chOutline },
      };
    });

    // Find next unwritten scene (first OUTLINE scene in order)
    const nextScene = scenes.find((s) => s.status === "OUTLINE") || null;
    let nextSceneTitle = nextScene?.title || null;
    let nextSceneId = nextScene?.id || null;

    // Get chapter/part context for next scene
    if (nextScene?.parentId) {
      const chapter = nodeMap.get(nextScene.parentId);
      if (chapter) {
        nextSceneTitle = `${chapter.title} › ${nextScene.title}`;
      }
    }

    // Estimated completion: extrapolate based on avg words per drafted scene
    let estimatedTotalWords: number | null = null;
    if (scenesDrafted > 0 && scenes.length > 0) {
      const avgWordsPerScene = totalWords / scenesDrafted;
      estimatedTotalWords = Math.round(avgWordsPerScene * scenes.length);
    }

    return NextResponse.json({
      totalWords,
      totalScenes: scenes.length,
      scenesDrafted,
      sceneStatusCounts,
      partProgress: topLevelGroups,
      nextScene: nextSceneId ? { id: nextSceneId, title: nextSceneTitle } : null,
      estimatedTotalWords,
    });
  } catch (error: unknown) {
    logger.error("GET /api/projects/[id]/progress error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
