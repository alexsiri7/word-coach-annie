import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { storyObjectId, universeId } = body;

        if (!storyObjectId || !universeId) {
            return NextResponse.json(
                { error: "storyObjectId and universeId are required" },
                { status: 400 }
            );
        }

        const result = await UniversesController.transferStoryObjectToUniverse(
            storyObjectId,
            universeId
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to transfer story object:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
