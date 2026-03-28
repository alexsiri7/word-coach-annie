import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

// POST /api/sessions - Create or end a writing session
export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    const body = await request.json();
    const { action, sessionId, projectId, nodeId, wordsWritten, duration } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const access = await verifyProjectAccess(projectId, userId);
    if (!access.authorized) return access.response;

    if (action === "start") {
      const session = await prisma.writingSession.create({
        data: {
          projectId,
          nodeId: nodeId || null,
          startedAt: new Date(),
        },
      });
      return NextResponse.json(session, { status: 201 });
    }

    if (action === "end" && sessionId) {
      const session = await prisma.writingSession.update({
        where: { id: sessionId },
        data: {
          endedAt: new Date(),
          wordsWritten: Math.max(0, wordsWritten || 0),
          duration: Math.max(0, duration || 0),
        },
      });
      return NextResponse.json(session);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    logger.error("POST /api/sessions error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/sessions?projectId=X&days=28 - Get session history for heatmap
export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get("projectId");
    const days = parseInt(searchParams.get("days") || "28");

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const access = await verifyProjectAccess(projectId, userId);
    if (!access.authorized) return access.response;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const sessions = await prisma.writingSession.findMany({
      where: {
        projectId,
        startedAt: { gte: since },
        endedAt: { not: null },
      },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        wordsWritten: true,
        duration: true,
      },
      orderBy: { startedAt: "asc" },
    });

    // Aggregate by date (YYYY-MM-DD)
    const byDate: Record<string, { words: number; sessions: number }> = {};
    for (const s of sessions) {
      const date = s.startedAt.toISOString().slice(0, 10);
      if (!byDate[date]) byDate[date] = { words: 0, sessions: 0 };
      byDate[date].words += s.wordsWritten;
      byDate[date].sessions += 1;
    }

    return NextResponse.json({ sessions, byDate });
  } catch (error: unknown) {
    logger.error("GET /api/sessions error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
