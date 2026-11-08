import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { isGoogleAuthMode } from "@/lib/auth";
import { clearSessionCookies, revokeRequestTokens } from "@/lib/end-session";
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
    // Shares of other owners' projects are keyed by the invitee's lowercased email, not a user relation.
    await prisma.$transaction([
      prisma.projectShare.deleteMany({ where: { email: user.email.toLowerCase() } }),
      prisma.googleDocExport.deleteMany({ where: { project: { userId } } }),
      prisma.googleDocExport.deleteMany({ where: { universe: { userId } } }),
      prisma.googleCredential.deleteMany({ where: { userId } }),
      prisma.hashnodeCredential.deleteMany({ where: { userId } }),
      prisma.project.deleteMany({ where: { userId } }),
      prisma.universe.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    await revokeRequestTokens(request);

    logger.info("DELETE /api/auth/delete-account: account deleted", { userId });

    const response = NextResponse.json({ ok: true });
    clearSessionCookies(response);
    return response;
  } catch (error) {
    logger.error("DELETE /api/auth/delete-account error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
