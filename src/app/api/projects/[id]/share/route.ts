import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/projects/[id]/share - List shares for this project (owner only)
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    const shares = await prisma.projectShare.findMany({
      where: { projectId: id },
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ shares });
  } catch (error) {
    logger.error("GET /api/projects/[id]/share error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/share - Add a reader (owner only)
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    const body = await request.json();
    const rawEmail = body.email;

    if (!rawEmail || typeof rawEmail !== "string" || !EMAIL_REGEX.test(rawEmail.trim())) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();

    // Check for existing share
    const existing = await prisma.projectShare.findUnique({
      where: { projectId_email: { projectId: id, email } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Already shared with this email" },
        { status: 409 }
      );
    }

    const share = await prisma.projectShare.create({
      data: { projectId: id, email, role: "READER" },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json(share, { status: 201 });
  } catch (error) {
    logger.error("POST /api/projects/[id]/share error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/share - Remove a reader (owner only)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(id, userId);
    if (!access.authorized) return access.response;

    const body = await request.json();
    const rawEmail = body.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();

    await prisma.projectShare.deleteMany({
      where: { projectId: id, email },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("DELETE /api/projects/[id]/share error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
