import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { StructureController, ConflictError } from "@/lib/controllers/structure";
import { getCurrentUserId, verifyProjectReadAccessByNode, verifyProjectWriteAccessByNode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeHtml } from "@/lib/sanitize-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;

  try {
    const userId = getCurrentUserId(request);
    const access = await verifyProjectReadAccessByNode(nodeId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const searchParams = request.nextUrl.searchParams;
    const versionId = searchParams.get("versionId");

    // If a specific version is requested, return just that version
    if (versionId) {
      const version = await prisma.contentVersion.findFirst({
        where: { id: versionId, nodeId },
      });

      if (!version) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }

      return NextResponse.json(version);
    }

    // Otherwise use controller to get latest + history + annotations
    const result = await StructureController.readSceneContent(nodeId);

    const versions = await prisma.contentVersion.findMany({
      where: { nodeId },
      orderBy: { createdAt: "desc" },
      select: { id: true, wordCount: true, createdAt: true },
    });

    return NextResponse.json({
      latest: result,
      history: versions.map((v: { id: string; wordCount: number; createdAt: Date }) => ({
        id: v.id,
        wordCount: v.wordCount,
        createdAt: v.createdAt
      }))
    });
  } catch (error) {
    logger.error("Failed to get content", error);
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
    const access = await verifyProjectWriteAccessByNode(nodeId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const body = await request.json();
    const { content, contentHash } = body;

    if (content === undefined || content === null) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const sanitizedContent = sanitizeHtml(content);
    const result = await StructureController.writeSceneContent(nodeId, sanitizedContent, contentHash);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { conflict: true, content: error.serverContent },
        { status: 409 }
      );
    }
    logger.error("Failed to save content", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;

  try {
    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccessByNode(nodeId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const body = await request.json();
    const { versionId } = body;

    if (!versionId || typeof versionId !== "string") {
      return NextResponse.json(
        { error: "versionId is required" },
        { status: 400 }
      );
    }

    const result = await StructureController.restoreSceneVersion(nodeId, versionId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    logger.error("Failed to restore content version", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
