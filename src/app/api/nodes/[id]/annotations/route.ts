import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { StructureController } from "@/lib/controllers/structure";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: nodeId } = await params;

    try {
        const annotations = await prisma.annotation.findMany({
            where: { nodeId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(annotations);
    } catch (error) {
        console.error("Failed to fetch annotations:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: nodeId } = await params;

    try {
        const body = await request.json();
        const { content, range, selectedText } = body;

        const annotation = await StructureController.addAnnotation(
            nodeId,
            content,
            range,
            selectedText
        );

        return NextResponse.json(annotation, { status: 201 });
    } catch (error) {
        console.error("Failed to create annotation:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json(
            { error: message },
            { status: message === "Content is required" ? 400 : 500 }
        );
    }
}
