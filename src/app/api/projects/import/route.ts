import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/api-auth";
import { importProjectJson } from "@/lib/import-json";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || !body.project || !body.exportVersion) {
      return NextResponse.json(
        { error: "Invalid export format: missing project or exportVersion" },
        { status: 400 }
      );
    }

    const { projectId } = await importProjectJson(body as unknown as Parameters<typeof importProjectJson>[0], {
      userId: userId ?? undefined,
    });

    const project = await prisma.project.findUnique({ where: { id: projectId } });

    return NextResponse.json({ ...project, id: projectId }, { status: 201 });
  } catch (error: unknown) {
    logger.error("POST /api/projects/import error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
