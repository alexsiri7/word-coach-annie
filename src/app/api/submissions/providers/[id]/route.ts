import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ProviderController } from "@/lib/controllers/submissions";
import { ProviderUpdateSchema } from "@/schemas/submissions";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";
import { NotFoundError, ConflictError } from "@/lib/errors";

type ProviderResolution =
    | { ok: true; id: string }
    | { ok: false; response: NextResponse };

async function resolveProvider(request: NextRequest, params: Promise<{ id: string }>): Promise<ProviderResolution> {
    const { id } = await params;
    const existing = await prisma.provider.findUnique({
        where: { id },
        select: { id: true, userId: true },
    });
    if (!existing) {
        return { ok: false, response: NextResponse.json({ error: "Provider not found" }, { status: 404 }) };
    }
    const userId = getCurrentUserId(request);
    if (userId && existing.userId !== userId) {
        return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { ok: true, id };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolved = await resolveProvider(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

        const body = await request.json().catch((err) => {
            logger.warn("PATCH /api/submissions/providers/[id]: invalid JSON body", err);
            return null;
        });
        if (body === null) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = ProviderUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }

        if (Object.keys(parsed.data).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const data = { ...parsed.data };
        if (data.name !== undefined) data.name = sanitizeInput(data.name);
        if (data.notes !== undefined) data.notes = sanitizeInput(data.notes);
        const provider = await ProviderController.updateProvider(id, data);

        return NextResponse.json(provider);
    } catch (error) {
        if (error instanceof NotFoundError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        logger.error("PATCH /api/submissions/providers/[id] error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolved = await resolveProvider(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

        await ProviderController.deleteProvider(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof ConflictError) {
            return NextResponse.json({ error: error.message }, { status: 409 });
        }
        logger.error("DELETE /api/submissions/providers/[id] error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
