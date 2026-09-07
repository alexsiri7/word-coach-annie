import { NextResponse } from "next/server";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/controllers/opportunities";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

export function opportunityErrorResponse(label: string, error: unknown): NextResponse {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
            { error: "A project can be a candidate for an opportunity only once." },
            { status: 409 }
        );
    }

    logger.error(`${label} error`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
