import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { isGoogleAuthMode } from "@/lib/auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { ProjectCreateSchema } from "@/schemas/projects";

// GET /api/projects - List projects (scoped by userId when authenticated via Google)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const MAX_LIMIT = 200;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1),
      MAX_LIMIT
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
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
            select: { structureNodes: true, storyObjects: true },
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

    // Calculate word counts and scene counts per project
    const projectWordCounts = new Map<string, number>();
    const projectSceneCounts = new Map<string, number>();
    for (const scene of allScenes) {
      const current = projectWordCounts.get(scene.projectId) || 0;
      projectWordCounts.set(scene.projectId, current + (latestWordCounts.get(scene.id) || 0));
      projectSceneCounts.set(scene.projectId, (projectSceneCounts.get(scene.projectId) || 0) + 1);
    }

    const projectsWithWordCount = projects.map((project) => ({
      ...project,
      wordCount: projectWordCounts.get(project.id) || 0,
      nodeCount: project._count.structureNodes,
      sceneCount: projectSceneCounts.get(project.id) || 0,
      characterCount: project._count.storyObjects,
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

// POST /api/projects - Create a new project (owned by current user)
export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    if (isGoogleAuthMode() && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ProjectCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { title, author, synopsis, genre, projectType } = parsed.data;

    // Only enforce active project limit for authenticated users; skip in API_TOKEN/dev mode
    let limitError: { error: string; status: number } | null = null;
    const project = await prisma.$transaction(
      async (tx) => {
        if (userId) {
          const [activeCount, settings] = await Promise.all([
            tx.project.count({ where: { userId, archivedAt: null } }),
            tx.userAiSettings.findUnique({ where: { userId }, select: { maxActiveProjects: true } }),
          ]);
          const limit = settings?.maxActiveProjects ?? 3; // matches schema @default(3)
          if (activeCount >= limit) {
            limitError = {
              error: `You've reached your ${limit} active project limit. Archive a project to create a new one.`,
              status: 403,
            };
            // Throw to abort the transaction without creating the project
            throw new Error("LIMIT_EXCEEDED");
          }
        }

        return tx.project.create({
          data: {
            title: sanitizeInput(title.trim()),
            author: author ? sanitizeInput(author.trim()) : "",
            synopsis: synopsis ? sanitizeInput(synopsis.trim()) : "",
            genre: genre ? sanitizeInput(genre.trim()) : "",
            projectType: projectType || "FICTION",
            ...(userId && { userId }),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    ).catch((err: unknown) => {
      if (err instanceof Error && err.message === "LIMIT_EXCEEDED") {
        return null; // handled via limitError
      }
      throw err; // re-throw unexpected errors (including P2034 serialization failure)
    });

    if (limitError) {
      return NextResponse.json(
        { error: (limitError as { error: string }).error },
        { status: (limitError as { status: number }).status }
      );
    }

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    // P2034 = transaction serialization failure (two concurrent requests raced)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Request conflict, please try again." },
        { status: 409 }
      );
    }
    logger.error("POST /api/projects error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
