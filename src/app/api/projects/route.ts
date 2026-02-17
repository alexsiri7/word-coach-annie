import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        _count: {
          select: { structureNodes: true },
        },
      },
    }),
    prisma.project.count(),
  ]);

  // Calculate word counts for each project
  const projectsWithWordCount = await Promise.all(
    projects.map(async (project: any) => {
      const scenes = await prisma.structureNode.findMany({
        where: { projectId: project.id, type: "SCENE" },
        select: { id: true },
      });

      let wordCount = 0;
      if (scenes.length > 0) {
        const latestVersions = await Promise.all(
          scenes.map((scene: any) =>
            prisma.contentVersion.findFirst({
              where: { nodeId: scene.id },
              orderBy: { createdAt: "desc" },
              select: { wordCount: true },
            })
          )
        );
        wordCount = latestVersions.reduce((sum: number, v: any) => sum + (v?.wordCount || 0), 0);
      }

      return {
        ...project,
        wordCount,
        nodeCount: project._count.structureNodes,
      };
    })
  );

  return NextResponse.json({ projects: projectsWithWordCount, total });
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, author, synopsis, genre, projectType } = body;

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
    },
  });

  return NextResponse.json(project, { status: 201 });
}
