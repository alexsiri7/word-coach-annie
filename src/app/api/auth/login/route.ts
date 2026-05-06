import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    deriveSessionToken,
    safeEqual,
} from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
    const apiToken = env.API_TOKEN;

    if (!apiToken) {
        return NextResponse.json(
            { error: "Authentication not configured (API_TOKEN not set)" },
            { status: 501 }
        );
    }

    const body = await request.json().catch(() => null);
    const token = body?.token;

    if (!token || !safeEqual(token, apiToken)) {
        return NextResponse.json(
            { error: "Invalid token" },
            { status: 401 }
        );
    }

    const sessionToken = await deriveSessionToken(apiToken);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: SESSION_MAX_AGE,
        path: "/",
    });

    return response;
}
