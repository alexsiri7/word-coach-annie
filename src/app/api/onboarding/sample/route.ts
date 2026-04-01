import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import { importProjectJson } from "@/lib/import-json";
import { logger } from "@/lib/logger";
import sampleData from "@/data/sherlock-sample.json";

// POST /api/onboarding/sample - Create sample project for new users
// Only creates the sample if the user has 0 projects.
export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    // Check if user already has projects
    const projectCount = await prisma.project.count({
      where: userId ? { userId } : {},
    });

    if (projectCount > 0) {
      return NextResponse.json(
        { message: "User already has projects" },
        { status: 200 }
      );
    }

    const { projectId } = await importProjectJson(sampleData, {
      userId: userId ?? undefined,
      isSample: true,
    });

    return NextResponse.json({ projectId }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/onboarding/sample error", error);
    return NextResponse.json(
      { error: "Failed to create sample project" },
      { status: 500 }
    );
  }
}
