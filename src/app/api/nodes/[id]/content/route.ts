import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Maximum number of content versions to keep per scene
const MAX_VERSIONS_PER_SCENE = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;

  try {
    const node = await prisma.structureNode.findUnique({
      where: { id: nodeId },
      select: { id: true, type: true },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

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

    // Otherwise return latest + history
    const versions = await prisma.contentVersion.findMany({
      where: { nodeId },
      orderBy: { createdAt: "desc" },
    });

    if (versions.length === 0) {
      return NextResponse.json({
        latest: null,
        history: [],
      });
    }

    const latest = versions[0];
    const history = versions.map((v: { id: string; wordCount: number; createdAt: Date }) => ({
      id: v.id,
      wordCount: v.wordCount,
      createdAt: v.createdAt,
    }));

    return NextResponse.json({ latest, history });
  } catch (error) {
    console.error("Failed to get content:", error);
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
    const node = await prisma.structureNode.findUnique({
      where: { id: nodeId },
      select: { id: true, type: true },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const body = await request.json();
    const { content } = body;

    if (content === undefined || content === null) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "content must be a string" },
        { status: 400 }
      );
    }

    const wordCount = content.trim() === "" ? 0 : content.trim().split(/\s+/).length;

    const version = await prisma.contentVersion.create({
      data: {
        nodeId,
        content,
        wordCount,
      },
    });

    // Prune old versions beyond MAX_VERSIONS_PER_SCENE
    const allVersions = await prisma.contentVersion.findMany({
      where: { nodeId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (allVersions.length > MAX_VERSIONS_PER_SCENE) {
      const idsToDelete = allVersions.slice(MAX_VERSIONS_PER_SCENE).map((v: { id: string }) => v.id);
      await prisma.contentVersion.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    console.error("Failed to save content:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/nodes/[id]/content - Restore a previous version
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;

  try {
    const node = await prisma.structureNode.findUnique({
      where: { id: nodeId },
      select: { id: true, type: true },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const body = await request.json();
    const { versionId } = body;

    if (!versionId || typeof versionId !== "string") {
      return NextResponse.json(
        { error: "versionId is required" },
        { status: 400 }
      );
    }

    // Find the version to restore
    const sourceVersion = await prisma.contentVersion.findFirst({
      where: { id: versionId, nodeId },
    });

    if (!sourceVersion) {
      return NextResponse.json(
        { error: "Version not found for this node" },
        { status: 404 }
      );
    }

    // Create a new version with the old content (restore = create new from old)
    const wordCount = sourceVersion.content.trim() === ""
      ? 0
      : sourceVersion.content.trim().split(/\s+/).length;

    const restoredVersion = await prisma.contentVersion.create({
      data: {
        nodeId,
        content: sourceVersion.content,
        wordCount,
      },
    });

    return NextResponse.json(restoredVersion, { status: 201 });
  } catch (error) {
    console.error("Failed to restore content version:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
