import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rows = await prisma.userConsent.findMany({ where: { userId } });
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/account/consent failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { feature, consentGiven } = body;

    if (typeof feature !== "string" || typeof consentGiven !== "boolean") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (!["sentry_replay", "claude_api"].includes(feature)) {
      return NextResponse.json({ error: "Unknown feature" }, { status: 400 });
    }

    const row = await prisma.userConsent.upsert({
      where: { userId_feature: { userId, feature } },
      update: { consentGiven },
      create: { userId, feature, consentGiven },
    });

    return NextResponse.json(row);
  } catch (error) {
    logger.error("PUT /api/account/consent error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
