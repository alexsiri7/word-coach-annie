import { NextRequest, NextResponse } from "next/server";
import { SessionsController } from "@/lib/controllers/sessions";
import { NotFoundError } from "@/lib/controllers/errors";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { SessionCreateSchema } from "@/schemas/sessions";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  try {
    const userId = getCurrentUserId(req);
    const access = await verifyProjectWriteAccess(projectId, userId, req.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const body = await req.json().catch(() => null);
    if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const parsed = SessionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { nodeId, startedAt, endedAt, wordsWritten, durationSeconds, date } = parsed.data;

    const session = await SessionsController.createSession({
      projectId,
      nodeId: nodeId ?? null,
      startedAt: startedAt ? new Date(startedAt) : undefined,
      endedAt: endedAt ? new Date(endedAt) : undefined,
      wordsWritten,
      durationSeconds,
      date,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    logger.error("Failed to create writing session", { error, projectId });
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
