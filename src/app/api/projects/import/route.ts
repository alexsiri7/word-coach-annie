import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/api-auth";
import { importProjectJson } from "@/lib/import-json";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isGoogleAuthMode } from "@/lib/auth";
import { ActiveProjectLimitError } from "@/lib/project-limit";

const MAX_IMPORT_BODY_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    if (isGoogleAuthMode() && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentLength = parseInt(request.headers.get("content-length") ?? "", 10);
    if (!isNaN(contentLength) && contentLength > MAX_IMPORT_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body exceeds maximum size of 5MB" },
        { status: 413 }
      );
    }

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
    if (error instanceof ActiveProjectLimitError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // P2034 = transaction serialization failure (concurrent creates raced the limit check)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Request conflict, please try again." }, { status: 409 });
    }
    logger.error("POST /api/projects/import error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
