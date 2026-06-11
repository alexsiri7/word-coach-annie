import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE, verifySessionToken } from "@/lib/auth";
import { revokeToken } from "@/lib/token-blocklist";
import { AccountDeleteSchema } from "@/schemas";
import { logger } from "@/lib/logger";

export async function DELETE(request: NextRequest) {
  try {
    // 1. CSRF guard
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;

    // 2. Auth check
    const userId = getCurrentUserId(request);
    if (!userId) {
      logger.warn("DELETE /api/auth/delete-account: rejected — userId is null");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      logger.warn("DELETE /api/auth/delete-account: user not found", { userId });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 4. Email confirmation
    const rawBody = await request.json().catch((err) => {
      logger.warn("[delete-account] Failed to parse request body:", err);
      return {};
    });
    const parsed = AccountDeleteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    if (parsed.data.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "Email does not match your account email" }, { status: 400 });
    }

    // 5. Revoke session before deletion (best-effort)
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
      const session = await verifySessionToken(sessionCookie);
      if (session?.jti) {
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
        try {
          await revokeToken(session.jti, session.userId, expiresAt);
        } catch (err) {
          logger.warn("[delete-account] Failed to revoke token (best-effort):", err);
        }
      }
    }

    // 6. Clean up data without FK cascade, then delete user
    await prisma.hashnodeCredential.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    logger.info("DELETE /api/auth/delete-account: account deleted", { userId });

    // 7. Clear session cookie
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
