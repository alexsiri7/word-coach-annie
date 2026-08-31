import { NextRequest, NextResponse } from "next/server";
import { ProviderController } from "@/lib/controllers/submissions";
import { ProviderCreateSchema } from "@/schemas/submissions";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const result = await ProviderController.listProviders(userId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error("GET /api/providers error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        // Auth first — matches project convention
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json().catch((e: unknown) => {
            logger.warn("Invalid JSON body received", { path: request.url, error: e instanceof Error ? e.message : String(e) });
            return null;
        });
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = ProviderCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const provider = await ProviderController.createProvider({
            userId,
            name: sanitizeInput(parsed.data.name),
            website: parsed.data.website ? sanitizeInput(parsed.data.website) : undefined,
            notes: parsed.data.notes ? sanitizeInput(parsed.data.notes) : undefined,
        });

        return NextResponse.json(provider, { status: 201 });
    } catch (error) {
        logger.error("POST /api/providers error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
