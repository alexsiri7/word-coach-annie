import { NextRequest, NextResponse } from "next/server";
import { revokePersonalToken } from "@/lib/personal-tokens";
import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        if (!(await revokePersonalToken(userId, id))) {
            return NextResponse.json({ error: "Token not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        logger.error("DELETE /api/account/api-tokens/[id] error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
