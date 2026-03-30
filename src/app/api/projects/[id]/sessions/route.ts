import { NextRequest, NextResponse } from "next/server";
import { SessionsController } from "@/lib/controllers/sessions";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  try {
    const userId = getCurrentUserId(req);
    const access = await verifyProjectAccess(projectId, userId);
    if (!access.authorized) return access.response;

    const body = await req.json();
    const session = await SessionsController.createSession({
      projectId,
      nodeId: body.nodeId ?? null,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
      wordsWritten: body.wordsWritten ?? 0,
      durationSeconds: body.durationSeconds ?? 0,
      date: body.date,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    logger.error("Failed to create writing session", { error, projectId });
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
