import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    deriveSessionToken,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
    const apiToken = process.env.API_TOKEN;

    if (!apiToken) {
        return NextResponse.json(
            { error: "Authentication not configured (API_TOKEN not set)" },
            { status: 501 }
        );
    }

    const body = await request.json().catch(() => null);
    const token = body?.token;

    if (!token || token !== apiToken) {
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
