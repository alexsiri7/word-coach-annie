import { NextRequest, NextResponse } from "next/server";
import { StructureController } from "@/lib/controllers/structure";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const roots = await StructureController.getOutline(projectId);
    return NextResponse.json(roots);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    logger.error("Failed to build outline", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
