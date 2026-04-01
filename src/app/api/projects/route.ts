import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

// GET /api/projects - List projects (scoped by userId when authenticated via Google)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    const showArchived = searchParams.get("archived") === "true";
    const userId = getCurrentUserId(request);

    // Scope by userId when authenticated; show all in API_TOKEN/dev mode
    // Filter by archive status: by default show non-archived, ?archived=true shows archived
    const where = {
      ...(userId ? { userId } : {}),
      archivedAt: showArchived ? { not: null } : null,
    };

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

    // Batch: get all scenes for all projects in one query
    const projectIds = projects.map((p) => p.id);
    const allScenes = await prisma.structureNode.findMany({
      where: { projectId: { in: projectIds }, type: "SCENE" },
      select: { id: true, projectId: true },
    });

    // Batch: get latest content version word counts for all scenes in one query
    // Use distinct to only fetch the latest version per scene, avoiding loading
    // the full version history for every scene.
    const sceneIds = allScenes.map((s) => s.id);
    const latestVersions = sceneIds.length > 0
      ? await prisma.contentVersion.findMany({
          where: { nodeId: { in: sceneIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["nodeId"],
          select: { nodeId: true, wordCount: true },
        })
      : [];

    // Build map: nodeId -> latest version's wordCount
    const latestWordCounts = new Map<string, number>();
    for (const v of latestVersions) {
      latestWordCounts.set(v.nodeId, v.wordCount ?? 0);
    }

    // Calculate word counts per project
    const projectWordCounts = new Map<string, number>();
    for (const scene of allScenes) {
      const current = projectWordCounts.get(scene.projectId) || 0;
      projectWordCounts.set(scene.projectId, current + (latestWordCounts.get(scene.id) || 0));
    }

    const projectsWithWordCount = projects.map((project) => ({
      ...project,
      wordCount: projectWordCounts.get(project.id) || 0,
      nodeCount: project._count.structureNodes,
    }));

    return NextResponse.json({ projects: projectsWithWordCount, total });
  } catch (error) {
    logger.error("GET /api/projects error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const FREE_PROJECT_LIMIT = 3;

// POST /api/projects - Create a new project (owned by current user)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, author, synopsis, genre, projectType } = body;
    const userId = getCurrentUserId(request);

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (userId) {
      const activeCount = await prisma.project.count({
        where: { userId, archivedAt: null },
      });
      if (activeCount >= FREE_PROJECT_LIMIT) {
        return NextResponse.json(
          {
            error: `Free accounts are limited to ${FREE_PROJECT_LIMIT} active projects. Archive or delete an existing project to create a new one.`,
            code: "PROJECT_LIMIT_REACHED",
          },
          { status: 403 }
        );
      }
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
  } catch (error) {
    logger.error("POST /api/projects error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
