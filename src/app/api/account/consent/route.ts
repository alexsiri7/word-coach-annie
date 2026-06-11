import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

const ConsentUpdateSchema = z.object({
  feature: z.enum(["sentry_replay", "claude_api"], { message: "Unknown feature" }),
  consentGiven: z.boolean({ message: "Invalid body" }),
});

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
  const csrfError = validateCsrfHeader(request);
  if (csrfError) return csrfError;
  try {
    const userId = getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ConsentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { feature, consentGiven } = parsed.data;

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
