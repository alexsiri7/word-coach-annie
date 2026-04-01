import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/api-auth";
import { ProjectsController } from "@/lib/controllers/projects";
import { logger } from "@/lib/logger";

// GET /api/projects/limit - Check current user's project limit status
export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    if (!userId) {
      return NextResponse.json({ allowed: true, current: 0, limit: Infinity });
    }

    const result = await ProjectsController.checkProjectLimit(userId);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("GET /api/projects/limit error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
