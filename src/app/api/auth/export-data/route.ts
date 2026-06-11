import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import { isGoogleAuthMode } from "@/lib/auth";
import archiver from "archiver";
import { PassThrough } from "stream";
import { exportProjectJson } from "@/lib/export-json";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    // In Google auth mode (multi-user), a null userId means unauthenticated — reject.
    // In API_TOKEN mode (single-user), userId is always null; allow and export all data.
    if (isGoogleAuthMode() && !userId) {
      logger.warn("GET /api/auth/export-data: rejected — userId is null");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : null;
    if (userId && !user) {
      logger.warn("GET /api/auth/export-data: rejected — userId not found in DB", { userId });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [projects, aiSettings] = await Promise.all([
      prisma.project.findMany({
        where: userId ? { userId } : {},
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
      userId
        ? prisma.userAiSettings.findUnique({ where: { userId } })
        : Promise.resolve(null),
    ]);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    if (user) {
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
    }

    for (const project of projects) {
      const data = await exportProjectJson(project.id);
      const safeTitle = project.title.replace(/[^a-zA-Z0-9]/g, "_");
      archive.append(JSON.stringify(data, null, 2), {
        name: `projects/${safeTitle}.json`,
      });
    }

    if (user) {
      const consents = await prisma.userConsent.findMany({
        where: { userId: user.id },
        select: { feature: true, consentGiven: true, updatedAt: true },
        orderBy: { feature: "asc" },
      });
      archive.append(
        JSON.stringify(
          consents.map((c) => ({
            feature: c.feature,
            consentGiven: c.consentGiven,
            updatedAt: c.updatedAt.toISOString(),
          })),
          null,
          2
        ),
        { name: "consents.json" }
      );
    }

    await archive.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of passthrough) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `annie-full-export-${timestamp}.zip`;

    logger.info("GET /api/auth/export-data: exported data", {
      userId: userId ?? "api-token",
      mode: isGoogleAuthMode() ? "google-auth" : "api-token",
    });

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
