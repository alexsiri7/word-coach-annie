import { NextRequest, NextResponse } from "next/server";
import { ProviderController } from "@/lib/controllers/submissions";
import { ProviderCreateSchema } from "@/schemas/submissions";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        const result = await ProviderController.listProviders(userId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error("GET /api/submissions/providers error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch((err) => {
            logger.warn("POST /api/submissions/providers: invalid JSON body", err);
            return null;
        });
        if (body === null) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = ProviderCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }

        const userId = getCurrentUserId(request);
        const provider = await ProviderController.createProvider({
            userId,
            name: sanitizeInput(parsed.data.name),
            website: parsed.data.website,
            notes: parsed.data.notes ? sanitizeInput(parsed.data.notes) : undefined,
        });

        return NextResponse.json(provider, { status: 201 });
    } catch (error) {
        logger.error("POST /api/submissions/providers error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
