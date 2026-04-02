import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyUniverseAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";

const VALID_RELATIONSHIP_TYPES = [
    "APPEARS_IN",
    "LOCATED_AT",
    "PART_OF_PLOTLINE",
    "RELATED_TO",
    "INTERACTS_WITH",
    "CONTAINS",
    "PRECEDES",
    "FOLLOWS",
] as const;

async function verifyWorldObjectAccess(worldObjectId: string, userId: string | null) {
    const wo = await prisma.worldObject.findUnique({
        where: { id: worldObjectId },
        select: { universeId: true },
    });
    if (!wo) {
        return { authorized: false as const, response: NextResponse.json({ error: "World object not found" }, { status: 404 }) };
    }
    return verifyUniverseAccess(wo.universeId, userId);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: worldObjectId } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyWorldObjectAccess(worldObjectId, userId);
        if (!access.authorized) return access.response;

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { type, label, toWorldObjectId } = body as {
            type?: string;
            label?: string;
            toWorldObjectId?: string;
        };

        if (!type) {
            return NextResponse.json({ error: "type is required" }, { status: 400 });
        }

        if (!VALID_RELATIONSHIP_TYPES.includes(type as (typeof VALID_RELATIONSHIP_TYPES)[number])) {
            return NextResponse.json(
                { error: `Invalid type. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}` },
                { status: 400 }
            );
        }

        if (!toWorldObjectId) {
            return NextResponse.json({ error: "toWorldObjectId is required" }, { status: 400 });
        }

        if (toWorldObjectId === worldObjectId) {
            return NextResponse.json({ error: "Cannot create a relationship to self" }, { status: 400 });
        }

        // Verify target world object exists and is in the same universe
        const sourceWo = await prisma.worldObject.findUnique({
            where: { id: worldObjectId },
            select: { universeId: true },
        });
        const targetWo = await prisma.worldObject.findUnique({
            where: { id: toWorldObjectId },
            select: { id: true, universeId: true },
        });

        if (!targetWo) {
            return NextResponse.json({ error: "Target world object not found" }, { status: 404 });
        }

        if (sourceWo && targetWo.universeId !== sourceWo.universeId) {
            return NextResponse.json({ error: "Target must be in the same universe" }, { status: 400 });
        }

        const relationship = await prisma.relationship.create({
            data: {
                type,
                ...(label !== undefined && { label: sanitizeInput(label) }),
                fromWorldObjectId: worldObjectId,
                toWorldObjectId,
            },
            include: {
                fromWorldObject: { select: { id: true, name: true, type: true } },
                toWorldObject: { select: { id: true, name: true, type: true } },
            },
        });

        return NextResponse.json(relationship, { status: 201 });
    } catch (error) {
        logger.error("POST /api/world-objects/[id]/relationships error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
