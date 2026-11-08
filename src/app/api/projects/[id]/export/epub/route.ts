import { NextRequest, NextResponse } from "next/server";
import epub from "epub-gen-memory";
import { prisma } from "@/lib/db";
import { buildOutlineTree } from "@/lib/outline-tree";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { buildEpubChapters } from "@/lib/epub-chapters";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const userEmail = request.headers.get("x-user-email");
    const access = await verifyProjectReadAccess(id, userId, userEmail);
    if (!access.authorized) return access.response;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const outline = await buildOutlineTree(id, { excludeOutlineScenes: access.role === "READER" });
    const chapters = buildEpubChapters(outline);

    const buffer = await epub(
      {
        title: project.title,
        author: project.author || "Unknown",
      },
      chapters
    );

    const filename = `${project.title.replace(/[^a-zA-Z0-9]/g, "_")}.epub`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("GET /api/projects/[id]/export/epub error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
