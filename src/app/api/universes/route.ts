import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { UniverseCreateSchema } from "@/schemas/universes";

export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);

        if (userId) {
            // Scoped query: only this user's universes
            const universes = await prisma.universe.findMany({
                where: { userId },
                orderBy: { updatedAt: "desc" },
                include: {
                    _count: {
                        select: { projects: true, worldObjects: true },
                    },
                },
            });

            return NextResponse.json(universes.map((u) => ({
                id: u.id,
                title: u.title,
                description: u.description,
                projectCount: u._count.projects,
                worldObjectCount: u._count.worldObjects,
                createdAt: u.createdAt.toISOString(),
                updatedAt: u.updatedAt.toISOString(),
            })));
        }

        // No userId (API_TOKEN / dev mode) — return all
        const universes = await UniversesController.listUniverses();
        return NextResponse.json(universes);
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = UniverseCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }
        const userId = getCurrentUserId(request);

        if (userId) {
            // Create with userId
            const universe = await prisma.universe.create({
                data: {
                    title: parsed.data.title.trim(),
                    description: parsed.data.description?.trim() || "",
                    userId,
                },
            });
            return NextResponse.json({
                id: universe.id,
                title: universe.title,
                description: universe.description,
                createdAt: universe.createdAt.toISOString(),
                updatedAt: universe.updatedAt.toISOString(),
            });
        }

        // No userId — use controller (legacy behavior)
        const universe = await UniversesController.createUniverse(parsed.data);
        return NextResponse.json(universe);
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
