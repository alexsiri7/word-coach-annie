import { type NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, revokeRequestTokens } from "@/lib/end-session";

export async function POST(request: NextRequest) {
    await revokeRequestTokens(request);

    const response = NextResponse.json({ ok: true });
    clearSessionCookies(response);
    return response;
}
