import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/api-auth";
import { importProjectJson } from "@/lib/import-json";
import { logger } from "@/lib/logger";
import sampleData from "@/data/sherlock-sample.json";

// POST /api/onboarding/sample - Create sample project for new users.
// The partial unique index on Project(userId) WHERE isSample = true prevents
// duplicates at the database level, eliminating the TOCTOU race condition.
export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    const { projectId } = await importProjectJson(sampleData, {
      userId: userId ?? undefined,
      isSample: true,
    });

    return NextResponse.json({ projectId }, { status: 201 });
  } catch (error) {
    // P2002 = unique constraint violation: another concurrent request already
    // created the sample project for this user.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { message: "User already has projects" },
        { status: 200 }
      );
    }
    logger.error("POST /api/onboarding/sample error", error);
    return NextResponse.json(
      { error: "Failed to create sample project" },
      { status: 500 }
    );
  }
}
