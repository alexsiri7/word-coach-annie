import { NextRequest, NextResponse } from "next/server";
import { SessionsController } from "@/lib/controllers/sessions";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    const heatmap = await SessionsController.getGlobalHeatmap(28, userId);
    return NextResponse.json(heatmap);
  } catch (error) {
    logger.error("Failed to get heatmap", { error });
    return NextResponse.json({ error: "Failed to get heatmap" }, { status: 500 });
  }
}
