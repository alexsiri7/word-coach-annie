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

    // userId is null in API_TOKEN / dev mode — no specific user account to export.
    // Middleware blocks truly unauthenticated requests before they reach this handler,
    // so null userId here means the request is authenticated but not user-scoped.
    let profileData: object | null = null;
    let safeAiSettings: object | null = null;
    let projects: { id: string; title: string }[] = [];

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const [userProjects, aiSettings] = await Promise.all([
        prisma.project.findMany({
          where: { userId },
          select: { id: true, title: true },
          orderBy: { title: "asc" },
        }),
        prisma.userAiSettings.findUnique({ where: { userId } }),
      ]);

      projects = userProjects;
      profileData = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };
      safeAiSettings = aiSettings
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
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Add profile (safe fields only)
    archive.append(JSON.stringify(profileData, null, 2), { name: "profile.json" });

    // Add AI settings (omit apiKey for security)
    archive.append(JSON.stringify(safeAiSettings, null, 2), {
      name: "ai-settings.json",
    });

    for (const project of projects) {
      const data = await exportProjectJson(project.id);
      const safeTitle = project.title.replace(/[^a-zA-Z0-9]/g, "_");
      archive.append(JSON.stringify(data, null, 2), {
        name: `projects/${safeTitle}.json`,
      });
    }

    await archive.finalize();

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
