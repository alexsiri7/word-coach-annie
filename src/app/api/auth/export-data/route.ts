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

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch projects and AI settings in parallel
    const [projects, aiSettings] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
      prisma.userAiSettings.findUnique({ where: { userId } }),
    ]);

    // Create ZIP archive
    const archive = archiver("zip", { zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Add profile (safe fields only)
    archive.append(
      JSON.stringify(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        null,
        2
      ),
      { name: "profile.json" }
    );

    // Add AI settings (omit apiKey for security)
    const safeAiSettings = aiSettings
      ? {
          model: aiSettings.model,
          customInstructions: aiSettings.customInstructions,
          coachingStyle: aiSettings.coachingStyle,
          responseLength: aiSettings.responseLength,
          chatWindowSize: aiSettings.chatWindowSize,
          messagesUntilCompression: aiSettings.messagesUntilCompression,
          compressionModel: aiSettings.compressionModel,
        }
      : null;
    archive.append(JSON.stringify(safeAiSettings, null, 2), {
      name: "ai-settings.json",
    });

    // Add each project as a JSON file
    for (const project of projects) {
      const data = await exportProjectJson(project.id);
      const safeTitle = project.title.replace(/[^a-zA-Z0-9]/g, "_");
      archive.append(JSON.stringify(data, null, 2), {
        name: `projects/${safeTitle}.json`,
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
    const filename = `annie-full-export-${timestamp}.zip`;

    logger.info("GET /api/auth/export-data: user exported data", { userId });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("GET /api/auth/export-data error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
