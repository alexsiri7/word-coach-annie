import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import archiver from "archiver";
import { PassThrough } from "stream";
import { exportProjectJson } from "@/lib/export-json";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const where = { userId };

    const projects = await prisma.project.findMany({
      where,
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    });

    if (projects.length === 0) {
      return NextResponse.json({ error: "No projects found" }, { status: 404 });
    }

    // Create ZIP archive
    const archive = archiver("zip", { zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Add each project as a JSON file
    for (const project of projects) {
      const data = await exportProjectJson(project.id);
      const safeTitle = project.title.replace(/[^a-zA-Z0-9]/g, "_");
      archive.append(JSON.stringify(data, null, 2), {
        name: `${safeTitle}.json`,
      });
    }

    await archive.finalize();

    // Collect the stream into a buffer
    const chunks: Buffer[] = [];
    for await (const chunk of passthrough) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `annie-export-${timestamp}.zip`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("GET /api/projects/export-all error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
