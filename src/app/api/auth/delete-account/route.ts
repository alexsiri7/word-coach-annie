import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { isGoogleAuthMode, SESSION_COOKIE_NAME, SESSION_MAX_AGE, verifySessionToken } from "@/lib/auth";
import { revokeToken } from "@/lib/token-blocklist";
import { AccountDeleteSchema } from "@/schemas/account";
import { logger } from "@/lib/logger";

export async function DELETE(request: NextRequest) {
  try {
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;

    if (!isGoogleAuthMode()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = AccountDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    if (parsed.data.email !== user.email) {
      return NextResponse.json({ error: "Email does not match" }, { status: 400 });
    }

    // Credentials and GoogleDocExports lack cascade; delete them explicitly before removing the user.
    // Project and Universe rows are also deleted explicitly (cascade covers them too, belt-and-suspenders).
    await prisma.$transaction([
      prisma.googleDocExport.deleteMany({ where: { project: { userId } } }),
      prisma.googleDocExport.deleteMany({ where: { universe: { userId } } }),
      prisma.googleCredential.deleteMany({ where: { userId } }),
      prisma.hashnodeCredential.deleteMany({ where: { userId } }),
      prisma.project.deleteMany({ where: { userId } }),
      prisma.universe.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    // Revoke session token (best-effort, after transaction)
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
      try {
        const session = await verifySessionToken(sessionCookie);
        if (session?.jti) {
          const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
          await revokeToken(session.jti, session.userId, expiresAt);
        }
      } catch (err) {
        logger.error("[delete-account] Failed to revoke token in blocklist:", err);
      }
    }

    logger.info("DELETE /api/auth/delete-account: account deleted", { userId });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    logger.error("DELETE /api/auth/delete-account error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
