import { NextResponse } from "next/server";
import { SessionsController } from "@/lib/controllers/sessions";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const heatmap = await SessionsController.getGlobalHeatmap(28);
    return NextResponse.json(heatmap);
  } catch (error) {
    logger.error("Failed to get heatmap", { error });
    return NextResponse.json({ error: "Failed to get heatmap" }, { status: 500 });
  }
}
