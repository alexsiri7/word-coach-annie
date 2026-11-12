import { NextRequest, NextResponse } from "next/server";
import { createPersonalToken, listPersonalTokens } from "@/lib/personal-tokens";
import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { ApiTokenCreateSchema } from "@/schemas/account";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        return NextResponse.json({ tokens: await listPersonalTokens(userId) });
    } catch (error) {
        logger.error("GET /api/account/api-tokens error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/** The plaintext token is in this response only; it cannot be retrieved later. */
export async function POST(request: NextRequest) {
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = ApiTokenCreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || "Invalid input" },
                { status: 400 }
            );
        }

        const { token, apiToken } = await createPersonalToken(userId, parsed.data.name, parsed.data.scope);
        logger.info("POST /api/account/api-tokens: token created", { userId, tokenId: apiToken.id });
        return NextResponse.json({ token, apiToken }, { status: 201 });
    } catch (error) {
        logger.error("POST /api/account/api-tokens error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
