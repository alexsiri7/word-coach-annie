import { NextRequest, NextResponse } from "next/server";
import { StructureController } from "@/lib/controllers/structure";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const projectId = searchParams.get("projectId") || undefined;

        // getOpenAnnotations returns unresolved by default
        const annotations = await StructureController.getOpenAnnotations(projectId);

        return NextResponse.json(annotations);
    } catch (error) {
        logger.error("Failed to get open annotations", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
