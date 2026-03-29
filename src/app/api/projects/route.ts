import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";

// GET /api/projects - List projects (scoped by userId when authenticated via Google)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");
  const userId = getCurrentUserId(request);

  // Scope by userId when authenticated; show all in API_TOKEN/dev mode
  const where = userId ? { userId } : {};

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        _count: {
          select: { structureNodes: true },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  // Batch: get all scenes for all projects in one query (include status + title for enriched cards)
  const projectIds = projects.map((p) => p.id);
  const allScenes = await prisma.structureNode.findMany({
    where: { projectId: { in: projectIds }, type: "SCENE" },
    select: { id: true, projectId: true, status: true, title: true, orderIndex: true },
    orderBy: { orderIndex: "asc" },
  });

  // Batch: get latest content version word counts for all scenes in one query
  const sceneIds = allScenes.map((s) => s.id);
  const allVersions = sceneIds.length > 0
    ? await prisma.contentVersion.findMany({
        where: { nodeId: { in: sceneIds } },
        orderBy: { createdAt: "desc" },
        select: { nodeId: true, wordCount: true },
      })
    : [];

  // Build map: nodeId -> latest version's wordCount (first match per nodeId is latest due to orderBy)
  const latestWordCounts = new Map<string, number>();
  for (const v of allVersions) {
    if (!latestWordCounts.has(v.nodeId)) {
      latestWordCounts.set(v.nodeId, v.wordCount ?? 0);
    }
  }

  // Calculate word counts and scene stats per project
  const projectWordCounts = new Map<string, number>();
  const projectSceneStats = new Map<string, {
    totalScenes: number;
    draftedScenes: number;
    nextUnwrittenScene: { id: string; title: string } | null;
  }>();
  for (const scene of allScenes) {
    const current = projectWordCounts.get(scene.projectId) || 0;
    projectWordCounts.set(scene.projectId, current + (latestWordCounts.get(scene.id) || 0));

    const stats = projectSceneStats.get(scene.projectId) || {
      totalScenes: 0,
      draftedScenes: 0,
      nextUnwrittenScene: null,
    };
    stats.totalScenes++;
    if (scene.status !== "OUTLINE") stats.draftedScenes++;
    if (!stats.nextUnwrittenScene && scene.status === "OUTLINE") {
      stats.nextUnwrittenScene = { id: scene.id, title: scene.title };
    }
    projectSceneStats.set(scene.projectId, stats);
  }

  const projectsWithWordCount = projects.map((project) => ({
    ...project,
    wordCount: projectWordCounts.get(project.id) || 0,
    nodeCount: project._count.structureNodes,
    ...(projectSceneStats.get(project.id) || {
      totalScenes: 0,
      draftedScenes: 0,
      nextUnwrittenScene: null,
    }),
  }));

  return NextResponse.json({ projects: projectsWithWordCount, total });
}

// POST /api/projects - Create a new project (owned by current user)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, author, synopsis, genre, projectType } = body;
  const userId = getCurrentUserId(request);

  if (!title || typeof title !== "string" || title.trim() === "") {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: {
      title: title.trim(),
      author: author?.trim() || "",
      synopsis: synopsis?.trim() || "",
      genre: genre?.trim() || "",
      projectType: projectType || "FICTION",
      ...(userId && { userId }),
    },
  });

  return NextResponse.json(project, { status: 201 });
}
