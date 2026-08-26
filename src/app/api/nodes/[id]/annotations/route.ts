import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ANNOTATION_ERRORS, StructureController } from "@/lib/controllers/structure";
import { getCurrentUserId, verifyProjectCommentAccessByNode, verifyProjectReadAccessByNode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: nodeId } = await params;

    try {
        const userId = getCurrentUserId(request);
        const access = await verifyProjectReadAccessByNode(nodeId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const annotations = await prisma.annotation.findMany({
            where: { nodeId },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(annotations);
    } catch (error) {
        logger.error("Failed to fetch annotations", error);
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
        const userId = getCurrentUserId(request);
        const access = await verifyProjectCommentAccessByNode(nodeId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const body = await request.json();
        const { content, range, selectedText } = body;

        const annotation = await StructureController.addAnnotation(
            nodeId,
            sanitizeInput(content),
            range,
            selectedText ? sanitizeInput(selectedText) : selectedText
        );

        return NextResponse.json(annotation, { status: 201 });
    } catch (error) {
        logger.error("Failed to create annotation", error);
        const isContentRequired = error instanceof Error && error.message === ANNOTATION_ERRORS.CONTENT_REQUIRED;
        return NextResponse.json(
            { error: isContentRequired ? ANNOTATION_ERRORS.CONTENT_REQUIRED : "Internal server error" },
            { status: isContentRequired ? 400 : 500 }
        );
    }
}
