import { NextRequest, NextResponse } from "next/server";
import { ProgressController } from "@/lib/controllers/progress";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  try {
    const userId = getCurrentUserId(request);
    const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const progress = await ProgressController.getProjectProgress(projectId);
    return NextResponse.json(progress);
  } catch (error) {
    logger.error("Failed to get project progress", { error, projectId });
    return NextResponse.json({ error: "Failed to get progress" }, { status: 500 });
  }
}
